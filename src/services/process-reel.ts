import type { Logger } from "pino";

import type { ClaimedReelJob, ExtractedReelJson } from "../types/pipeline.js";
import { normalizeReelUrl } from "../utils/reel-url.js";
import { createWorkingDirectory, cleanupWorkingDirectory } from "../utils/files.js";
import { withRetries } from "../utils/retry.js";
import { fetchReel } from "./fetcher/index.js";
import { inspectMediaFile } from "./media/inspect-media.js";
import { preprocessMedia } from "./media/preprocess-media.js";
import { transcribeAudio } from "./transcribe/index.js";
import { extractOnScreenText } from "./ocr/index.js";
import { analyzeVisualContent } from "./vision/index.js";
import { buildStructuredOutput } from "./output/build-structured-output.js";

export async function processReelJob(input: {
  job: ClaimedReelJob;
  logger: Logger;
}): Promise<{
  transcript: string;
  description: string;
  extracted: ExtractedReelJson;
}> {
  const normalized = normalizeReelUrl(input.job.url);
  const mockMode = normalized.platform === "mock";
  const workingDirectory = await createWorkingDirectory(`reel-${input.job.id}`);

  try {
    const fetchResult = await withRetries({
      stage: "fetch",
      logger: input.logger,
      taskName: "fetchReel",
      run: () =>
        fetchReel({
          normalized,
          workingDirectory,
          logger: input.logger,
        }),
    });

    const probe = await withRetries({
      stage: "media-verify",
      logger: input.logger,
      taskName: "inspectMediaFile",
      run: () => inspectMediaFile(fetchResult.mediaPath),
      maxRetries: 1,
    });

    const preparedMedia = await withRetries({
      stage: "media-preprocess",
      logger: input.logger,
      taskName: "preprocessMedia",
      run: () =>
        preprocessMedia({
          sourceVideoPath: fetchResult.mediaPath,
          probe,
          workingDirectory,
        }),
      maxRetries: 1,
    });

    const transcript = await withRetries({
      stage: "transcribe",
      logger: input.logger,
      taskName: "transcribeAudio",
      run: () =>
        transcribeAudio({
          audioPath: preparedMedia.audioPath,
          mockMode,
        }),
    });

    const ocr = await withRetries({
      stage: "ocr",
      logger: input.logger,
      taskName: "extractOnScreenText",
      run: () =>
        extractOnScreenText({
          media: preparedMedia,
          mockMode,
        }),
    });

    const vision = await withRetries({
      stage: "vision",
      logger: input.logger,
      taskName: "analyzeVisualContent",
      run: () =>
        analyzeVisualContent({
          media: preparedMedia,
          transcript,
          ocr,
          mockMode,
        }),
    });

    const extracted = await withRetries({
      stage: "output",
      logger: input.logger,
      taskName: "buildStructuredOutput",
      run: () =>
        buildStructuredOutput({
          reelId: input.job.id,
          normalized,
          fetchResult,
          preparedMedia,
          transcript,
          ocr,
          vision,
          mockMode,
        }),
    });

    return {
      transcript: transcript.fullText,
      description: fetchResult.metadata.caption?.trim() || extracted.summary,
      extracted,
    };
  } finally {
    await cleanupWorkingDirectory(workingDirectory);
  }
}
