import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "../../config/env.js";
import { PipelineError } from "../../types/errors.js";
import type { FetchResult, NormalizedReelUrl } from "../../types/pipeline.js";

function inferExtension(url: URL, contentType: string | null): string {
  const pathname = url.pathname.toLowerCase();

  if (pathname.endsWith(".mov")) return ".mov";
  if (pathname.endsWith(".webm")) return ".webm";
  if (pathname.endsWith(".m4v")) return ".m4v";
  return ".mp4";
}

function isVideoContentType(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith("video/"));
}

export async function fetchDirectMedia(normalized: NormalizedReelUrl, workingDirectory: string): Promise<FetchResult> {
  const url = new URL(normalized.canonicalUrl);
  const headers = { "user-agent": "reeltor/0.1 (+server worker)" };

  let response: Response;

  try {
    response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new PipelineError({
      code: "FETCH_NETWORK_ERROR",
      stage: "fetch",
      retryable: true,
      message: "Failed to download media from the direct URL.",
      details: { url: normalized.canonicalUrl },
      cause: error,
    });
  }

  if (!response.ok) {
    throw new PipelineError({
      code: "FETCH_DOWNLOAD_FAILED",
      stage: "fetch",
      retryable: response.status >= 500 || response.status === 429,
      message: `Direct media URL returned HTTP ${response.status}.`,
      details: { status: response.status, url: normalized.canonicalUrl },
    });
  }

  const contentType = response.headers.get("content-type");

  if (!isVideoContentType(contentType)) {
    throw new PipelineError({
      code: "FETCH_RETURNED_NON_VIDEO",
      stage: "fetch",
      retryable: false,
      message: "The direct URL did not return a video payload.",
      details: { contentType, url: normalized.canonicalUrl },
    });
  }

  if (!response.body) {
    throw new PipelineError({
      code: "EMPTY_FETCH_BODY",
      stage: "fetch",
      retryable: true,
      message: "The media response body was empty.",
      details: { url: normalized.canonicalUrl },
    });
  }

  const downloadsDir = path.join(workingDirectory, "downloads");
  await mkdir(downloadsDir, { recursive: true });
  const mediaPath = path.join(downloadsDir, `source${inferExtension(url, contentType)}`);

  await pipeline(Readable.fromWeb(response.body as globalThis.ReadableStream), createWriteStream(mediaPath));

  return {
    mediaPath,
    metadata: {},
    diagnostics: {
      provider: "direct",
      notes: ["Fetched direct video URL without page extraction."],
    },
  };
}
