import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

import { env } from "../../config/env.js";
import { parseJson } from "../../utils/json.js";
import { runCommand } from "../../utils/spawn.js";
import type { PipelineStage } from "../../types/pipeline.js";

export function getFfmpegPath(): string {
  return env.FFMPEG_PATH || ffmpegInstaller.path;
}

export function getFfprobePath(): string {
  return env.FFPROBE_PATH || ffprobeInstaller.path;
}

export async function runFfmpeg(args: string[], stage: PipelineStage, cwd?: string): Promise<void> {
  await runCommand({
    command: getFfmpegPath(),
    args,
    stage,
    cwd,
    timeoutMs: env.REQUEST_TIMEOUT_MS * 6,
  });
}

export async function runFfprobe(filePath: string): Promise<Record<string, unknown>> {
  const result = await runCommand({
    command: getFfprobePath(),
    args: ["-v", "quiet", "-print_format", "json", "-show_format", "-show_streams", filePath],
    stage: "media-verify",
    timeoutMs: env.REQUEST_TIMEOUT_MS,
  });

  return parseJson<Record<string, unknown>>(result.stdout, "media-verify", "FFPROBE_JSON_INVALID");
}
