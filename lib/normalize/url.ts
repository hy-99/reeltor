import { PipelineError } from "../utils/errors.js";
import type { NormalizedReelUrl, SupportedPlatform } from "../../types/pipeline.js";

const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "igshid",
  "ig_rid",
  "si",
  "feature",
  "mibextid",
]);

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
    stage: "url-validation",
    retryable: false,
    message: `Unsupported reel platform: ${hostname}`,
    details: { hostname, pathname },
  });
}

function stripTrackingParams(url: URL, platform: SupportedPlatform): URL {
  const next = new URL(url.toString());

  if (platform === "direct") {
    for (const key of [...next.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (TRACKING_PARAMS.has(lower) || TRACKING_PARAM_PREFIXES.some((prefix) => lower.startsWith(prefix))) {
        next.searchParams.delete(key);
      }
    }

    return next;
  }

  next.search = "";
  next.hash = "";
  return next;
}

export function normalizeReelUrl(rawUrl: string): NormalizedReelUrl {
  const trimmed = rawUrl.trim();

  if (!trimmed) {
    throw new PipelineError({
      code: "EMPTY_URL",
      stage: "url-validation",
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
      stage: "url-validation",
      retryable: false,
      message: "The reel URL is malformed.",
      details: { reelUrl: trimmed },
      cause: error,
    });
  }

  if (!["https:", "http:", "mock:"].includes(parsed.protocol)) {
    throw new PipelineError({
      code: "UNSUPPORTED_PROTOCOL",
      stage: "url-validation",
      retryable: false,
      message: `Unsupported URL protocol: ${parsed.protocol}`,
      details: { protocol: parsed.protocol },
    });
  }

  const platform = inferPlatform(parsed);
  const canonical = stripTrackingParams(parsed, platform);

  if (canonical.protocol === "http:" && platform !== "direct") {
    canonical.protocol = "https:";
  }

  return {
    originalUrl: trimmed,
    canonicalUrl: canonical.toString(),
    platform,
    normalizedChanged: canonical.toString() !== trimmed,
  };
}
