import { env } from "../config/env.js";
import { closePool, getPool } from "../db/client.js";
import { ReelsRepository } from "../db/reels-repository.js";
import { indexReelForSearch } from "../services/indexing/reel-indexer.js";
import { processReelJob } from "../services/process-reel.js";
import { createLogger } from "../utils/logger.js";
import { asPipelineError, logPipelineError } from "../utils/errors.js";

const logger = createLogger();
const pool = getPool();
const repository = new ReelsRepository(pool, logger);

let shuttingDown = false;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function installSignalHandlers(): void {
  const handleSignal = (signal: string) => {
    shuttingDown = true;
    logger.warn({ signal }, "Shutdown signal received. Finishing the current loop.");
  };

  process.on("SIGINT", () => handleSignal("SIGINT"));
  process.on("SIGTERM", () => handleSignal("SIGTERM"));
}

async function processClaimedJob(input: {
  lease: Awaited<ReturnType<ReelsRepository["claimProcessingJobs"]>>[number];
  capabilities: Awaited<ReturnType<ReelsRepository["validateSchema"]>>;
}): Promise<void> {
  const jobLogger = logger.child({ reelId: input.lease.job.id, url: input.lease.job.url });

  try {
    jobLogger.info({ stage: "database-claim" }, "Starting claimed reel job.");
    const processed = await processReelJob({
      job: input.lease.job,
      logger: jobLogger,
    });

    await input.lease.markComplete({
      transcript: processed.transcript,
      description: processed.description,
      extractedJson: processed.extracted,
      hasExtractedJsonColumn: input.capabilities.hasExtractedJson,
    });

    jobLogger.info({ stage: "database-write" }, "Saved extracted data back to reels row.");

    try {
      await indexReelForSearch({
        repository,
        capabilities: input.capabilities,
        logger: jobLogger,
        reelId: input.lease.job.id,
        transcript: processed.transcript,
        description: processed.description,
        extracted: processed.extracted,
      });
    } catch (error) {
      jobLogger.warn({ err: error, stage: "indexing" }, "Search indexing follow-up failed. Extraction remains complete.");
    }
  } catch (error) {
    const pipelineError = asPipelineError(error, "database-write");
    logPipelineError(jobLogger, pipelineError, "Reel processing failed.");

    try {
      await input.lease.markError(pipelineError);
    } catch (writeError) {
      jobLogger.error({ err: writeError }, "Failed to persist reel error state.");
    }
  } finally {
    await input.lease.release();
  }
}

async function main(): Promise<void> {
  installSignalHandlers();
  const capabilities = await repository.validateSchema();

  logger.info(
    {
      capabilities,
      pollIntervalMs: env.POLL_INTERVAL_MS,
      batchSize: env.BATCH_SIZE,
    },
    "Reeltor worker started.",
  );

  if (!capabilities.hasExtractedJson) {
    logger.warn(
      "reels.extracted_json was not found. Full structured output will not be persisted until the migration is applied.",
    );
  }

  while (!shuttingDown) {
    const leases = await repository.claimProcessingJobs(env.BATCH_SIZE);

    if (leases.length === 0) {
      logger.debug({ stage: "database-claim" }, "No processing rows were claimable in this poll.");
      await sleep(env.POLL_INTERVAL_MS);
      continue;
    }

    logger.info({ claimed: leases.length }, "Claimed processing rows from reels.");

    for (const lease of leases) {
      if (shuttingDown) {
        break;
      }

      await processClaimedJob({ lease, capabilities });
    }
  }
}

main()
  .catch((error) => {
    logger.error({ err: error }, "Worker crashed.");
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
