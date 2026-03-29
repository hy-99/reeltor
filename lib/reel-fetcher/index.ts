import type { Logger } from "pino";

import { env } from "../config/env.js";
import type { FetchOutcome, NormalizedReelUrl } from "../../types/pipeline.js";
import { PipelineError } from "../utils/errors.js";
import { fetchDirectMedia } from "./direct-media-fetcher.js";
import { fetchMockReel } from "./mock-fetcher.js";
import { fetchViaYtDlp } from "./yt-dlp-fetcher.js";

export async function fetchReel(input: {
  normalized: NormalizedReelUrl;
  workingDirectory: string;
  logger: Logger;
}): Promise<FetchOutcome> {
  const { normalized, logger, workingDirectory } = input;

  logger.info(
    { stage: "fetch", platform: normalized.platform, canonicalUrl: normalized.canonicalUrl },
    "Fetching reel media.",
  );

  if (normalized.platform === "mock" || env.REELTOR_FETCH_MODE === "mock") {
    return fetchMockReel({ normalized, workingDirectory });
  }

  if (env.REELTOR_FETCH_MODE === "direct" || normalized.platform === "direct") {
    return fetchDirectMedia({ normalized, workingDirectory });
  }

  if (env.REELTOR_FETCH_MODE === "yt-dlp") {
    return fetchViaYtDlp({ normalized, workingDirectory });
  }

  if (env.REELTOR_FETCH_MODE === "auto") {
    if (env.REELTOR_YT_DLP_PATH) {
      return fetchViaYtDlp({ normalized, workingDirectory });
    }
  }

  throw new PipelineError({
    code: "FETCHER_NOT_CONFIGURED",
    stage: "fetch",
    retryable: false,
    message: `No fetcher is configured for platform ${normalized.platform}.`,
    details: {
      platform: normalized.platform,
      fetchMode: env.REELTOR_FETCH_MODE,
      ytDlpConfigured: Boolean(env.REELTOR_YT_DLP_PATH),
    },
  });
}
