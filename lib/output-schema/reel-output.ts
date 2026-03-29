import { z } from "zod";

import type {
  AgentReadyResult,
  FetchOutcome,
  MediaInfo,
  NormalizedReelUrl,
  OcrResult,
  ReelStructuredOutput,
  TranscriptResult,
  VisionResult,
} from "../../types/pipeline.js";

export const reelStructuredOutputSchema = z.object({
  source: z.object({
    record_id: z.string(),
    platform: z.enum(["instagram", "tiktok", "facebook", "youtube", "direct", "mock"]),
    reel_url: z.string(),
    canonical_url: z.string(),
  }),
  fetch: z.object({
    success: z.boolean(),
    media_accessible: z.boolean(),
  }),
  media: z.object({
    duration_seconds: z.number(),
    has_audio: z.boolean(),
    width: z.number(),
    height: z.number(),
    format: z.string(),
    video_codec: z.string(),
    audio_codec: z.string(),
  }),
  metadata: z.object({
    caption: z.string(),
    creator: z.string(),
    post_id: z.string(),
    posted_at: z.string(),
    thumbnail_url: z.string(),
  }),
  transcript: z.object({
    full_text: z.string(),
    segments: z.array(
      z.object({
        start: z.number(),
        end: z.number(),
        text: z.string(),
      }),
    ),
    language: z.string(),
  }),
  ocr: z.object({
    texts: z.array(
      z.object({
        time: z.number(),
        text: z.string(),
      }),
    ),
  }),
  vision: z.object({
    content_type: z.string(),
    summary: z.string(),
    entities: z.object({
      people: z.array(z.string()),
      products: z.array(z.string()),
      brands: z.array(z.string()),
      objects: z.array(z.string()),
      places: z.array(z.string()),
    }),
    actions: z.array(z.string()),
    scenes: z.array(
      z.object({
        time: z.number(),
        description: z.string(),
      }),
    ),
  }),
  agent_ready: z.object({
    summary: z.string(),
    key_facts: z.array(z.string()),
    recommended_tags: z.array(z.string()),
    actionable_items: z.array(z.string()),
  }),
});

export function buildAgentReadyResult(input: {
  normalized: NormalizedReelUrl;
  fetchOutcome: FetchOutcome;
  mediaInfo: MediaInfo;
  transcript: TranscriptResult;
  ocr: OcrResult;
  vision: VisionResult;
}): AgentReadyResult {
  const tags = new Set<string>([
    input.normalized.platform,
    input.vision.contentType || "unknown-content",
    input.transcript.language || "unknown-language",
  ]);

  for (const brand of input.vision.entities.brands) tags.add(brand.toLowerCase().replace(/\s+/g, "-"));
  for (const product of input.vision.entities.products) tags.add(product.toLowerCase().replace(/\s+/g, "-"));

  const keyFacts = [
    input.fetchOutcome.metadata.creator && `Creator: ${input.fetchOutcome.metadata.creator}`,
    input.fetchOutcome.metadata.postId && `Post ID: ${input.fetchOutcome.metadata.postId}`,
    input.mediaInfo.durationSeconds > 0 && `Duration: ${input.mediaInfo.durationSeconds.toFixed(2)}s`,
    input.mediaInfo.hasAudio ? "Audio present" : "No audio track detected",
    input.vision.contentType && `Content type: ${input.vision.contentType}`,
  ].filter(Boolean) as string[];

  const actionableItems = [
    input.transcript.fullText && "Use transcript as the primary semantic grounding for downstream agents.",
    input.ocr.texts.length > 0 && "Use on-screen text for CTA, product names, and offer extraction.",
    input.vision.entities.products.length > 0 && "Map detected products to catalog or product knowledge before outreach.",
    input.vision.entities.brands.length > 0 && "Resolve brand mentions to canonical brand records.",
  ].filter(Boolean) as string[];

  return {
    summary:
      input.vision.summary ||
      input.transcript.fullText.slice(0, 280) ||
      "No strong multimodal summary could be extracted.",
    keyFacts,
    recommendedTags: [...tags].filter(Boolean),
    actionableItems,
  };
}

export function buildStructuredOutput(input: {
  recordId: string;
  normalized: NormalizedReelUrl;
  fetchOutcome: FetchOutcome;
  mediaInfo: MediaInfo;
  transcript: TranscriptResult;
  ocr: OcrResult;
  vision: VisionResult;
}): ReelStructuredOutput {
  const agentReady = buildAgentReadyResult(input);

  const output: ReelStructuredOutput = {
    source: {
      record_id: input.recordId,
      platform: input.normalized.platform,
      reel_url: input.normalized.originalUrl,
      canonical_url: input.normalized.canonicalUrl,
    },
    fetch: {
      success: input.fetchOutcome.success,
      media_accessible: input.fetchOutcome.mediaAccessible,
    },
    media: {
      duration_seconds: input.mediaInfo.durationSeconds,
      has_audio: input.mediaInfo.hasAudio,
      width: input.mediaInfo.width,
      height: input.mediaInfo.height,
      format: input.mediaInfo.format,
      video_codec: input.mediaInfo.videoCodec,
      audio_codec: input.mediaInfo.audioCodec,
    },
    metadata: {
      caption: input.fetchOutcome.metadata.caption,
      creator: input.fetchOutcome.metadata.creator,
      post_id: input.fetchOutcome.metadata.postId,
      posted_at: input.fetchOutcome.metadata.postedAt,
      thumbnail_url: input.fetchOutcome.metadata.thumbnailUrl,
    },
    transcript: {
      full_text: input.transcript.fullText,
      segments: input.transcript.segments,
      language: input.transcript.language,
    },
    ocr: {
      texts: input.ocr.texts,
    },
    vision: {
      content_type: input.vision.contentType,
      summary: input.vision.summary,
      entities: input.vision.entities,
      actions: input.vision.actions,
      scenes: input.vision.scenes,
    },
    agent_ready: {
      summary: agentReady.summary,
      key_facts: agentReady.keyFacts,
      recommended_tags: agentReady.recommendedTags,
      actionable_items: agentReady.actionableItems,
    },
  };

  return reelStructuredOutputSchema.parse(output);
}
