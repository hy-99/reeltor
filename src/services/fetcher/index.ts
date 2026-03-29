import type { Logger } from "pino";

import { env } from "../../config/env.js";
import { PipelineError } from "../../types/errors.js";
import type { FetchResult, NormalizedReelUrl } from "../../types/pipeline.js";
import { fetchDirectMedia } from "./direct-fetcher.js";
import { fetchMockReel } from "./mock-fetcher.js";
import { fetchViaYtDlp } from "./yt-dlp-fetcher.js";

export async function fetchReel(input: {
  normalized: NormalizedReelUrl;
  workingDirectory: string;
  logger: Logger;
}): Promise<FetchResult> {
  const { normalized, workingDirectory, logger } = input;

  logger.info({ stage: "fetch", platform: normalized.platform }, "Fetching reel media.");

  if (normalized.platform === "mock") {
    if (!env.ENABLE_MOCK_FETCH) {
      throw new PipelineError({
        code: "MOCK_FETCH_DISABLED",
        stage: "fetch",
        retryable: false,
        message: "Mock fetch is disabled. Set ENABLE_MOCK_FETCH=true for local mock runs.",
      });
    }

    return fetchMockReel(workingDirectory);
  }

  if (normalized.platform === "direct") {
    return fetchDirectMedia(normalized, workingDirectory);
  }

  if (env.YT_DLP_PATH) {
    return fetchViaYtDlp(normalized, workingDirectory);
  }

  throw new PipelineError({
    code: "FETCH_PROVIDER_NOT_CONFIGURED",
    stage: "fetch",
    retryable: false,
    message: `No public fetch provider is configured for platform ${normalized.platform}.`,
    details: { platform: normalized.platform },
  });
}
