import type { Logger } from "pino";

import type { ClaimedReelJob, NormalizedReelUrl, ReelStructuredOutput } from "../../types/pipeline.js";
import { inspectMediaFile } from "../media/inspect.js";
import { preprocessMedia } from "../media/preprocess.js";
import { extractOnScreenText } from "../ocr/index.js";
import { buildStructuredOutput } from "../output-schema/reel-output.js";
import { fetchReel } from "../reel-fetcher/index.js";
import { transcribeAudio } from "../transcribe/index.js";
import { cleanupWorkingDirectory, createWorkingDirectory } from "../utils/files.js";
import { analyzeVisualContent } from "../vision/index.js";

export async function processNormalizedReel(input: {
  job: ClaimedReelJob;
  normalized: NormalizedReelUrl;
  logger: Logger;
}): Promise<ReelStructuredOutput> {
  const workingDirectory = await createWorkingDirectory(`reel-${input.job.id}`);

  try {
    input.logger.info({ stage: "fetch", workingDirectory }, "Created reel working directory.");

    const fetchOutcome = await fetchReel({
      normalized: input.normalized,
      workingDirectory,
      logger: input.logger,
    });

    input.logger.info({ stage: "media-verification", mediaPath: fetchOutcome.mediaPath }, "Inspecting downloaded media.");
    const mediaInfo = await inspectMediaFile(fetchOutcome.mediaPath);

    input.logger.info({ stage: "preprocessing" }, "Preprocessing media artifacts.");
    const preprocessed = await preprocessMedia({
      sourceVideoPath: fetchOutcome.mediaPath,
      mediaInfo,
      workingDirectory,
    });

    input.logger.info({ stage: "transcription", hasAudio: mediaInfo.hasAudio }, "Running speech-to-text.");
    const transcript = await transcribeAudio(preprocessed.audioPath);

    input.logger.info({ stage: "ocr", frameCount: preprocessed.frames.length }, "Extracting on-screen text.");
    const ocr = await extractOnScreenText(preprocessed);

    input.logger.info({ stage: "vision" }, "Analyzing frame semantics.");
    const vision = await analyzeVisualContent({
      preprocessed,
      transcript,
      ocr,
    });

    return buildStructuredOutput({
      recordId: input.job.id,
      normalized: input.normalized,
      fetchOutcome,
      mediaInfo,
      transcript,
      ocr,
      vision,
    });
  } finally {
    await cleanupWorkingDirectory(workingDirectory);
  }
}
