import { readFile } from "node:fs/promises";
import path from "node:path";

import type { ClaimedReelJob } from "../types/pipeline.js";
import { env } from "../lib/config/env.js";
import { createLogger } from "../lib/logging/logger.js";
import { normalizeReelUrl } from "../lib/normalize/url.js";
import { processNormalizedReel } from "../lib/pipeline/process-reel.js";

const logger = createLogger({ mode: "single-test" });

async function loadFixture(): Promise<ClaimedReelJob> {
  const overrideUrl = process.argv[2];

  if (overrideUrl) {
    return {
      id: "cli-test-001",
      reelUrl: overrideUrl,
      status: "processing",
      retryCount: 1,
      lastAttemptAt: new Date().toISOString(),
    };
  }

  const fixturePath = path.resolve(env.REELTOR_LOCAL_TEST_FIXTURE);
  const raw = await readFile(fixturePath, "utf8");
  const parsed = JSON.parse(raw) as { id: string; reel_url: string };

  return {
    id: parsed.id,
    reelUrl: parsed.reel_url,
    status: "processing",
    retryCount: 1,
    lastAttemptAt: new Date().toISOString(),
  };
}

async function main(): Promise<void> {
  const job = await loadFixture();
  const normalized = normalizeReelUrl(job.reelUrl);
  const output = await processNormalizedReel({ job, normalized, logger });

  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

main().catch((error) => {
  logger.error({ err: error }, "Single test reel run failed.");
  process.exitCode = 1;
});
