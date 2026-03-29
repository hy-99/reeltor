import { access } from "node:fs/promises";
import { constants } from "node:fs";

import type { MediaInfo } from "../../types/pipeline.js";
import { PipelineError } from "../utils/errors.js";
import { runFfprobeJson } from "./ffmpeg.js";

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

export async function inspectMediaFile(filePath: string): Promise<MediaInfo> {
  try {
    await access(filePath, constants.R_OK);
  } catch (error) {
    throw new PipelineError({
      code: "MEDIA_FILE_MISSING",
      stage: "media-verification",
      retryable: false,
      message: "Downloaded media file does not exist.",
      details: { filePath },
      cause: error,
    });
  }

  let probe: Record<string, unknown>;

  try {
    probe = await runFfprobeJson(filePath);
  } catch (error) {
    throw new PipelineError({
      code: "INVALID_MEDIA",
      stage: "media-verification",
      retryable: false,
      message: "The downloaded file is not a valid video file.",
      details: { filePath },
      cause: error,
    });
  }

  const streams = ((probe.streams as FfprobeStream[] | undefined) ?? []).filter(Boolean);
  const format = (probe.format as FfprobeFormat | undefined) ?? {};
  const videoStream = streams.find((stream) => stream.codec_type === "video");
  const audioStream = streams.find((stream) => stream.codec_type === "audio");
  const durationSeconds = Number(format.duration ?? 0);

  if (!videoStream) {
    throw new PipelineError({
      code: "NO_VIDEO_STREAM",
      stage: "media-verification",
      retryable: false,
      message: "The media file does not contain a video stream.",
      details: { filePath },
    });
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new PipelineError({
      code: "INVALID_DURATION",
      stage: "media-verification",
      retryable: false,
      message: "The media file has an invalid duration.",
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
