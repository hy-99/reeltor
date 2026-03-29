import { constants } from "node:fs";
import { access } from "node:fs/promises";

import type { MediaProbe } from "../../types/pipeline.js";
import { PipelineError } from "../../types/errors.js";
import { runFfprobe } from "./ffmpeg.js";

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
}

interface FfprobeFormat {
  duration?: string;
  format_name?: string;
}

export async function inspectMediaFile(filePath: string): Promise<MediaProbe> {
  try {
    await access(filePath, constants.R_OK);
  } catch (error) {
    throw new PipelineError({
      code: "MEDIA_FILE_MISSING",
      stage: "media-verify",
      retryable: false,
      message: "The fetched media file does not exist.",
      details: { filePath },
      cause: error,
    });
  }

  const probe = await runFfprobe(filePath);
  const streams = (probe.streams as FfprobeStream[] | undefined) ?? [];
  const format = (probe.format as FfprobeFormat | undefined) ?? {};

  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(format.duration ?? 0);

  if (!videoStream) {
    throw new PipelineError({
      code: "NO_VIDEO_STREAM",
      stage: "media-verify",
      retryable: false,
      message: "The fetched asset is not a valid video.",
      details: { filePath },
    });
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new PipelineError({
      code: "INVALID_MEDIA_DURATION",
      stage: "media-verify",
      retryable: false,
      message: "The fetched video has an invalid duration.",
      details: { duration: format.duration, filePath },
    });
  }

  return {
    durationSeconds,
    hasAudio: Boolean(audioStream),
    width: videoStream.width ?? 0,
    height: videoStream.height ?? 0,
    format: format.format_name ?? "",
    videoCodec: videoStream.codec_name ?? "",
    audioCodec: audioStream?.codec_name ?? "",
  };
}
