import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import type { MediaProbe, PreparedMedia } from "../../types/pipeline.js";
import { runFfmpeg } from "./ffmpeg.js";

export async function preprocessMedia(input: {
  sourceVideoPath: string;
  probe: MediaProbe;
  workingDirectory: string;
}): Promise<PreparedMedia> {
  const normalizedVideoPath = path.join(input.workingDirectory, "normalized.mp4");

  await runFfmpeg(
    [
      "-y",
      "-i",
      input.sourceVideoPath,
      "-vf",
      `scale=${env.NORMALIZED_VIDEO_WIDTH}:${env.NORMALIZED_VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${env.NORMALIZED_VIDEO_WIDTH}:${env.NORMALIZED_VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
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
    "media-preprocess",
  );

  let audioPath: string | null = null;

  if (input.probe.hasAudio) {
    audioPath = path.join(input.workingDirectory, "audio.wav");
    await runFfmpeg(
      ["-y", "-i", normalizedVideoPath, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "pcm_s16le", audioPath],
      "media-preprocess",
    );
  }

  const framesDir = path.join(input.workingDirectory, "frames");
  await mkdir(framesDir, { recursive: true });

  await runFfmpeg(
    [
      "-y",
      "-i",
      normalizedVideoPath,
      "-vf",
      `fps=${(1 / env.FRAME_INTERVAL_SECONDS).toFixed(5)}`,
      "-frames:v",
      String(env.MAX_FRAMES),
      "-q:v",
      "2",
      path.join(framesDir, "frame-%03d.jpg"),
    ],
    "media-preprocess",
  );

  const frameFiles = (await readdir(framesDir)).filter((file) => file.endsWith(".jpg")).sort();

  return {
    normalizedVideoPath,
    audioPath,
    probe: input.probe,
    frames: frameFiles.map((file, index) => ({
      timeSeconds: Number((index * env.FRAME_INTERVAL_SECONDS).toFixed(2)),
      path: path.join(framesDir, file),
    })),
  };
}
