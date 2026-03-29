import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import type { MediaInfo, PreprocessedMedia } from "../../types/pipeline.js";
import { env } from "../config/env.js";
import { runFfmpeg } from "./ffmpeg.js";

export async function preprocessMedia(input: {
  sourceVideoPath: string;
  mediaInfo: MediaInfo;
  workingDirectory: string;
}): Promise<PreprocessedMedia> {
  const normalizedVideoPath = path.join(input.workingDirectory, "normalized.mp4");

  await runFfmpeg(
    [
      "-y",
      "-i",
      input.sourceVideoPath,
      "-vf",
      `scale=${env.REELTOR_OUTPUT_VIDEO_WIDTH}:${env.REELTOR_OUTPUT_VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${env.REELTOR_OUTPUT_VIDEO_WIDTH}:${env.REELTOR_OUTPUT_VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-ar",
      "16000",
      "-ac",
      "1",
      normalizedVideoPath,
    ],
    "preprocessing",
  );

  let audioPath: string | null = null;

  if (input.mediaInfo.hasAudio) {
    audioPath = path.join(input.workingDirectory, "audio.wav");
    await runFfmpeg(
      ["-y", "-i", normalizedVideoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath],
      "preprocessing",
    );
  }

  const framesDirectory = path.join(input.workingDirectory, "frames");
  const framePattern = path.join(framesDirectory, "frame-%03d.jpg");
  await mkdir(framesDirectory, { recursive: true });

  await runFfmpeg(
    [
      "-y",
      "-i",
      normalizedVideoPath,
      "-vf",
      `fps=${(1 / env.REELTOR_FRAME_INTERVAL_SECONDS).toFixed(5)}`,
      "-frames:v",
      String(env.REELTOR_MAX_FRAMES),
      "-q:v",
      "2",
      framePattern,
    ],
    "preprocessing",
  );

  const frameFiles = (await readdir(framesDirectory)).filter((file) => file.endsWith(".jpg")).sort();

  return {
    normalizedVideoPath,
    audioPath,
    frames: frameFiles.map((file, index) => ({
      time: Number((index * env.REELTOR_FRAME_INTERVAL_SECONDS).toFixed(2)),
      path: path.join(framesDirectory, file),
    })),
  };
}
