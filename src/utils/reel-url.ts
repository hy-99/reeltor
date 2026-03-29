import { PipelineError } from "../types/errors.js";
import type { NormalizedReelUrl, SupportedPlatform } from "../types/pipeline.js";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "igshid", "ig_rid", "mibextid", "si"]);

function inferPlatform(url: URL): SupportedPlatform {
  if (url.protocol === "mock:") {
    return "mock";
  }

  const hostname = url.hostname.replace(/^www\./, "").toLowerCase();
  const pathname = url.pathname.toLowerCase();

  if (pathname.match(/\.(mp4|mov|m4v|webm)$/)) {
    return "direct";
  }

  if (hostname === "instagram.com" && (pathname.startsWith("/reel/") || pathname.startsWith("/reels/"))) {
    return "instagram";
  }

  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) {
    return "tiktok";
  }

  if (hostname === "facebook.com" || hostname === "fb.watch") {
    return "facebook";
  }

  if (hostname === "youtube.com" || hostname === "youtu.be") {
    return "youtube";
  }

  throw new PipelineError({
    code: "UNSUPPORTED_PLATFORM",
    stage: "url-normalize",
    retryable: false,
    message: `Unsupported reel platform: ${hostname}`,
    details: { hostname, pathname },
  });
}

function removeTracking(url: URL, platform: SupportedPlatform): URL {
  const next = new URL(url.toString());

  if (platform === "direct") {
    for (const key of [...next.searchParams.keys()]) {
      if (TRACKING_PARAMS.has(key.toLowerCase()) || key.toLowerCase().startsWith("utm_")) {
        next.searchParams.delete(key);
      }
    }
  } else {
    next.search = "";
    next.hash = "";
  }

  if (next.protocol === "http:" && platform !== "direct") {
    next.protocol = "https:";
  }

  return next;
}

export function normalizeReelUrl(rawUrl: string): NormalizedReelUrl {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new PipelineError({
      code: "EMPTY_URL",
      stage: "url-normalize",
      retryable: false,
      message: "The reel URL is empty.",
    });
  }

  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch (error) {
    throw new PipelineError({
      code: "INVALID_URL",
      stage: "url-normalize",
      retryable: false,
      message: "The reel URL is malformed.",
      details: { url: trimmed },
      cause: error,
    });
  }

  if (!["https:", "http:", "mock:"].includes(parsed.protocol)) {
    throw new PipelineError({
      code: "UNSUPPORTED_PROTOCOL",
      stage: "url-normalize",
      retryable: false,
      message: `Unsupported protocol: ${parsed.protocol}`,
      details: { url: trimmed },
    });
  }

  const platform = inferPlatform(parsed);
  const canonical = removeTracking(parsed, platform);

  return {
    originalUrl: trimmed,
    canonicalUrl: canonical.toString(),
    platform,
    normalizedChanged: canonical.toString() !== trimmed,
  };
}
