import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";

import { env } from "../../config/env.js";
import { PipelineError } from "../../types/errors.js";
import type { FetchMetadata, FetchResult, NormalizedReelUrl } from "../../types/pipeline.js";
import { parseJson } from "../../utils/json.js";
import { runCommand } from "../../utils/spawn.js";

interface YtDlpMetadata {
  id?: string;
  description?: string;
  uploader?: string;
  channel?: string;
  timestamp?: number;
  thumbnail?: string;
}

function toMetadata(input: YtDlpMetadata): FetchMetadata {
  return {
    caption: input.description ?? "",
    creator: input.uploader ?? input.channel ?? "",
    postId: input.id ?? "",
    postedAt: input.timestamp ? new Date(input.timestamp * 1000).toISOString() : "",
    thumbnailUrl: input.thumbnail ?? "",
  };
}

function classifyExtractorFailure(stderr: string): PipelineError {
  const lower = stderr.toLowerCase();

  if (lower.includes("private") || lower.includes("login required")) {
    return new PipelineError({
      code: "PRIVATE_REEL",
      stage: "fetch",
      retryable: false,
      message: "The reel is private or requires authentication.",
    });
  }

  if (lower.includes("404") || lower.includes("not found") || lower.includes("unavailable")) {
    return new PipelineError({
      code: "REEL_NOT_FOUND",
      stage: "fetch",
      retryable: false,
      message: "The reel appears to be deleted or unavailable.",
    });
  }

  if (lower.includes("rate limit") || lower.includes("429")) {
    return new PipelineError({
      code: "RATE_LIMITED",
      stage: "fetch",
      retryable: true,
      message: "The fetch provider was rate-limited while retrieving the reel.",
    });
  }

  return new PipelineError({
    code: "FETCH_PROVIDER_FAILED",
    stage: "fetch",
    retryable: true,
    message: "The public reel fetch provider failed.",
    details: { stderr: stderr.slice(0, 2_000) },
  });
}

export async function fetchViaYtDlp(normalized: NormalizedReelUrl, workingDirectory: string): Promise<FetchResult> {
  if (!env.YT_DLP_PATH) {
    throw new PipelineError({
      code: "FETCH_PROVIDER_NOT_CONFIGURED",
      stage: "fetch",
      retryable: false,
      message: "YT_DLP_PATH is required for public reel page fetching.",
    });
  }

  let metadata: YtDlpMetadata;

  try {
    const probe = await runCommand({
      command: env.YT_DLP_PATH,
      args: ["--dump-single-json", "--no-warnings", "--skip-download", normalized.canonicalUrl],
      stage: "fetch",
      cwd: workingDirectory,
      timeoutMs: env.REQUEST_TIMEOUT_MS * 2,
    });

    metadata = parseJson<YtDlpMetadata>(probe.stdout, "fetch", "FETCH_PROVIDER_JSON_INVALID");
  } catch (error) {
    if (error instanceof PipelineError && error.code === "COMMAND_FAILED") {
      throw classifyExtractorFailure(String(error.details?.stderr ?? ""));
    }

    throw error;
  }

  const downloadsDir = path.join(workingDirectory, "downloads");
  await mkdir(downloadsDir, { recursive: true });

  try {
    await runCommand({
      command: env.YT_DLP_PATH,
      args: [
        "--no-warnings",
        "--no-progress",
        "--no-part",
        "-o",
        path.join(downloadsDir, "source.%(ext)s"),
        normalized.canonicalUrl,
      ],
      stage: "fetch",
      cwd: workingDirectory,
      timeoutMs: env.REQUEST_TIMEOUT_MS * 6,
    });
  } catch (error) {
    if (error instanceof PipelineError && error.code === "COMMAND_FAILED") {
      throw classifyExtractorFailure(String(error.details?.stderr ?? ""));
    }

    throw error;
  }

  const files = (await readdir(downloadsDir)).filter((file) => !file.endsWith(".part")).sort();
  const mediaFile = files.find((file) => !file.endsWith(".json"));

  if (!mediaFile) {
    throw new PipelineError({
      code: "NO_MEDIA_DOWNLOADED",
      stage: "fetch",
      retryable: false,
      message: "The public reel fetch provider did not produce a media file.",
    });
  }

  return {
    mediaPath: path.join(downloadsDir, mediaFile),
    metadata: toMetadata(metadata),
    diagnostics: {
      provider: "yt-dlp",
      notes: ["Fetched media via external public reel page extractor."],
    },
  };
}
