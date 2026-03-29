import { closePool, getPool } from "../lib/db/client.js";
import { ReelJobsRepository } from "../lib/db/reel-jobs-repository.js";
import { createLogger } from "../lib/logging/logger.js";
import { normalizeReelUrl } from "../lib/normalize/url.js";
import { processNormalizedReel } from "../lib/pipeline/process-reel.js";
import { env } from "../lib/config/env.js";
import { sleep } from "../lib/utils/sleep.js";
import { asPipelineError, toPersistedFailure } from "../lib/utils/errors.js";

const logger = createLogger();
const pool = getPool();
const repository = new ReelJobsRepository(pool, logger);

let shuttingDown = false;

function installSignalHandlers() {
  const shutdown = (signal: string) => {
    shuttingDown = true;
    logger.warn({ signal }, "Shutdown signal received. Finishing current loop before exit.");
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

async function processJob(job: Awaited<ReturnType<typeof repository.claimPendingJobs>>[number]): Promise<void> {
  const jobLogger = logger.child({ recordId: job.id, retryCount: job.retryCount, reelUrl: job.reelUrl });
  let canonicalUrl: string | null = null;

  try {
    jobLogger.info({ stage: "url-validation" }, "Normalizing reel URL.");
    const normalized = normalizeReelUrl(job.reelUrl);
    canonicalUrl = normalized.canonicalUrl;

    const output = await processNormalizedReel({
      job,
      normalized,
      logger: jobLogger,
    });

    await repository.markCompleted({
      recordId: job.id,
      canonicalUrl: normalized.canonicalUrl,
      output,
    });

    jobLogger.info({ stage: "database-writeback" }, "Completed reel processing.");
  } catch (error) {
    const pipelineError = asPipelineError(error, "database-writeback");
    const failure = toPersistedFailure(pipelineError);

    jobLogger.error({ err: pipelineError, failure }, "Reel processing failed.");
    await repository.markFailed({
      recordId: job.id,
      canonicalUrl,
      failure,
    });
  }
}

async function main(): Promise<void> {
  installSignalHandlers();

  logger.info("Validating database schema.");
  await repository.validateSchema();
  logger.info("Starting reel processing worker.");

  while (!shuttingDown) {
    const jobs = await repository.claimPendingJobs();

    if (jobs.length === 0) {
      logger.debug({ stage: "database-read" }, "No eligible reel jobs found.");
      await sleep(env.REELTOR_POLL_INTERVAL_MS);
      continue;
    }

    logger.info({ claimed: jobs.length }, "Claimed reel jobs for processing.");

    for (const job of jobs) {
      if (shuttingDown) {
        break;
      }

      await processJob(job);
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
