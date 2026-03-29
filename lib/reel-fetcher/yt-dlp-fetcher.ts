import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { env } from "../config/env.js";
import { PipelineError } from "../utils/errors.js";
import { parseJsonObject } from "../utils/json.js";
import { runCommand } from "../utils/spawn.js";
import type { FetchOutcome, NormalizedReelUrl, ReelMetadata } from "../../types/pipeline.js";

interface YtDlpMetadata {
  id?: string;
  description?: string;
  uploader?: string;
  channel?: string;
  timestamp?: number;
  thumbnail?: string;
}

function classifyYtDlpError(message: string): PipelineError {
  const lower = message.toLowerCase();

  if (lower.includes("private") || lower.includes("login required")) {
    return new PipelineError({
      code: "PRIVATE_REEL",
      stage: "fetch",
      retryable: false,
      message: "The reel is private or requires authentication.",
    });
  }

  if (lower.includes("unsupported url")) {
    return new PipelineError({
      code: "UNSUPPORTED_PLATFORM_FETCH",
      stage: "fetch",
      retryable: false,
      message: "yt-dlp does not support this reel URL.",
    });
  }

  if (lower.includes("404") || lower.includes("not found") || lower.includes("unavailable")) {
    return new PipelineError({
      code: "REEL_REMOVED",
      stage: "fetch",
      retryable: false,
      message: "The reel appears to be removed or unavailable.",
    });
  }

  if (lower.includes("429") || lower.includes("rate limit")) {
    return new PipelineError({
      code: "RATE_LIMITED",
      stage: "fetch",
      retryable: true,
      message: "The extractor was rate limited while fetching the reel.",
    });
  }

  return new PipelineError({
    code: "YT_DLP_FAILED",
    stage: "fetch",
    retryable: true,
    message: "yt-dlp failed to fetch the reel.",
    details: { stderr: message.slice(0, 2_000) },
  });
}

function toMetadata(input: YtDlpMetadata): ReelMetadata {
  return {
    caption: input.description ?? "",
    creator: input.uploader ?? input.channel ?? "",
    postId: input.id ?? "",
    postedAt: input.timestamp ? new Date(input.timestamp * 1000).toISOString() : "",
    thumbnailUrl: input.thumbnail ?? "",
  };
}

export async function fetchViaYtDlp(input: {
  normalized: NormalizedReelUrl;
  workingDirectory: string;
}): Promise<FetchOutcome> {
  if (!env.REELTOR_YT_DLP_PATH) {
    throw new PipelineError({
      code: "YT_DLP_NOT_CONFIGURED",
      stage: "fetch",
      retryable: false,
      message: "REELTOR_YT_DLP_PATH is required for platform reel fetching.",
    });
  }

  let metadata: YtDlpMetadata;

  try {
    const probe = await runCommand({
      command: env.REELTOR_YT_DLP_PATH,
      args: ["--dump-single-json", "--no-warnings", "--skip-download", input.normalized.canonicalUrl],
      stage: "fetch",
      timeoutMs: env.REELTOR_REQUEST_TIMEOUT_MS * 2,
      cwd: input.workingDirectory,
    });

    metadata = parseJsonObject<YtDlpMetadata>(probe.stdout, "fetch", "YT_DLP_JSON_INVALID");
  } catch (error) {
    if (error instanceof PipelineError && error.code === "COMMAND_FAILED") {
      const stderr = String(error.details?.stderr ?? "");
      throw classifyYtDlpError(stderr);
    }

    throw error;
  }

  const outputTemplate = path.join(input.workingDirectory, "downloads", "source.%(ext)s");
  await mkdir(path.join(input.workingDirectory, "downloads"), { recursive: true });

  try {
    await runCommand({
      command: env.REELTOR_YT_DLP_PATH,
      args: [
        "--no-warnings",
        "--no-progress",
        "--no-part",
        "-o",
        outputTemplate,
        input.normalized.canonicalUrl,
      ],
      stage: "fetch",
      timeoutMs: env.REELTOR_REQUEST_TIMEOUT_MS * 6,
      cwd: input.workingDirectory,
    });
  } catch (error) {
    if (error instanceof PipelineError && error.code === "COMMAND_FAILED") {
      const stderr = String(error.details?.stderr ?? "");
      throw classifyYtDlpError(stderr);
    }

    throw error;
  }

  const files = await readdir(path.join(input.workingDirectory, "downloads"));
  const mediaFile = files
    .filter((file) => !file.endsWith(".part") && !file.endsWith(".json"))
    .sort()
    .at(0);

  if (!mediaFile) {
    throw new PipelineError({
      code: "NO_MEDIA_DOWNLOADED",
      stage: "fetch",
      retryable: false,
      message: "yt-dlp returned metadata but no media file was downloaded.",
    });
  }

  return {
    success: true,
    mediaAccessible: true,
    mediaPath: path.join(input.workingDirectory, "downloads", mediaFile),
    metadata: toMetadata(metadata),
  };
}
