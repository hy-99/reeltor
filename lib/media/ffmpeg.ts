import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

import { env } from "../config/env.js";
import { runCommand } from "../utils/spawn.js";
import type { PipelineStage } from "../../types/pipeline.js";

export function getFfmpegPath(): string {
  return ffmpegInstaller.path;
}

export function getFfprobePath(): string {
  return ffprobeInstaller.path;
}

export async function runFfmpeg(args: string[], stage: PipelineStage, cwd?: string): Promise<void> {
  await runCommand({
    command: getFfmpegPath(),
    args,
    stage,
    timeoutMs: env.REELTOR_REQUEST_TIMEOUT_MS * 4,
    cwd,
  });
}

export async function runFfprobeJson(filePath: string): Promise<Record<string, unknown>> {
  const result = await runCommand({
    command: getFfprobePath(),
    args: ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
    stage: "media-verification",
    timeoutMs: env.REELTOR_REQUEST_TIMEOUT_MS,
  });

  return JSON.parse(result.stdout) as Record<string, unknown>;
}
