import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { env } from "../config/env.js";
import { PipelineError } from "../utils/errors.js";
import type { FetchOutcome, NormalizedReelUrl } from "../../types/pipeline.js";

function inferExtension(url: URL, contentType: string | null): string {
  const pathname = url.pathname.toLowerCase();

  if (pathname.endsWith(".mov")) return ".mov";
  if (pathname.endsWith(".webm")) return ".webm";
  if (pathname.endsWith(".m4v")) return ".m4v";
  if (pathname.endsWith(".mp4")) return ".mp4";

  if (contentType?.includes("webm")) return ".webm";
  if (contentType?.includes("quicktime")) return ".mov";

  return ".mp4";
}

function isVideoLikeContentType(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith("video/"));
}

export async function fetchDirectMedia(input: {
  normalized: NormalizedReelUrl;
  workingDirectory: string;
}): Promise<FetchOutcome> {
  const url = new URL(input.normalized.canonicalUrl);
  const headers = { "user-agent": "reeltor/0.1 (+backend worker)" };

  let headResponse: Response | null = null;

  try {
    headResponse = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(env.REELTOR_REQUEST_TIMEOUT_MS),
      headers,
      redirect: "follow",
    });
  } catch {
    headResponse = null;
  }

  const hintedContentType = headResponse?.headers.get("content-type") ?? null;

  if (headResponse && !headResponse.ok && headResponse.status !== 405) {
    throw new PipelineError({
      code: "FETCH_HEAD_FAILED",
      stage: "fetch",
      retryable: headResponse.status >= 500 || headResponse.status === 429,
      message: `The media URL returned HTTP ${headResponse.status}.`,
      details: { url: url.toString(), status: headResponse.status },
    });
  }

  if (hintedContentType && !isVideoLikeContentType(hintedContentType)) {
    throw new PipelineError({
      code: "FETCH_RETURNED_HTML",
      stage: "fetch",
      retryable: false,
      message: "The URL returned non-video content instead of reel media.",
      details: { url: url.toString(), contentType: hintedContentType },
    });
  }

  let response: Response;

  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(env.REELTOR_REQUEST_TIMEOUT_MS),
      headers,
      redirect: "follow",
    });
  } catch (error) {
    throw new PipelineError({
      code: "FETCH_NETWORK_ERROR",
      stage: "fetch",
      retryable: true,
      message: "The direct media request failed before receiving a response.",
      details: { url: url.toString() },
      cause: error,
    });
  }

  if (!response.ok) {
    throw new PipelineError({
      code: "FETCH_DOWNLOAD_FAILED",
      stage: "fetch",
      retryable: response.status >= 500 || response.status === 429,
      message: `The media download returned HTTP ${response.status}.`,
      details: { url: url.toString(), status: response.status },
    });
  }

  const contentType = response.headers.get("content-type") ?? hintedContentType;

  if (!isVideoLikeContentType(contentType)) {
    throw new PipelineError({
      code: "FETCH_RETURNED_HTML",
      stage: "fetch",
      retryable: false,
      message: "The URL returned HTML or another non-video payload.",
      details: { url: url.toString(), contentType },
    });
  }

  if (!response.body) {
    throw new PipelineError({
      code: "EMPTY_FETCH_BODY",
      stage: "fetch",
      retryable: true,
      message: "The media response body was empty.",
      details: { url: url.toString() },
    });
  }

  const downloadsDirectory = path.join(input.workingDirectory, "downloads");
  await mkdir(downloadsDirectory, { recursive: true });
  const mediaPath = path.join(downloadsDirectory, `source${inferExtension(url, contentType)}`);

  await pipeline(Readable.fromWeb(response.body as globalThis.ReadableStream), createWriteStream(mediaPath));

  return {
    success: true,
    mediaAccessible: true,
    mediaPath,
    metadata: {
      caption: "",
      creator: "",
      postId: "",
      postedAt: "",
      thumbnailUrl: "",
    },
  };
}
