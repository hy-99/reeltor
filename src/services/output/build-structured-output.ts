import { z } from "zod";

import { env } from "../../config/env.js";
import type {
  ExtractedReelJson,
  FetchResult,
  NormalizedReelUrl,
  OcrResult,
  PreparedMedia,
  TranscriptResult,
  VisionResult,
} from "../../types/pipeline.js";
import { createVisionJson } from "../../utils/openai.js";
import { buildStructuredOutputPrompt, STRUCTURED_OUTPUT_SYSTEM_PROMPT } from "./prompts.js";

const structuredOutputSchema = z.object({
  summary: z.string(),
  content_type: z.string(),
  transcript: z.string(),
  ocr_text: z.array(z.string()),
  entities: z.object({
    people: z.array(z.string()),
    products: z.array(z.string()),
    brands: z.array(z.string()),
    objects: z.array(z.string()),
    places: z.array(z.string()),
  }),
  actions: z.array(z.string()),
  key_facts: z.array(z.string()),
  recommended_tags: z.array(z.string()),
});

function buildHeuristicOutput(input: {
  reelId: string;
  normalized: NormalizedReelUrl;
  fetchResult: FetchResult;
  preparedMedia: PreparedMedia;
  transcript: TranscriptResult;
  ocr: OcrResult;
  vision: VisionResult;
}): ExtractedReelJson {
  const transcript = input.transcript.fullText;
  const ocrText = input.ocr.items.map((item) => item.text);
  const summary =
    input.fetchResult.metadata.caption?.trim() ||
    input.vision.summary ||
    transcript.slice(0, 280) ||
    "No strong multimodal summary was available.";

  const recommendedTags = new Set<string>([
    input.normalized.platform,
    input.vision.contentType || "unknown",
    ...input.vision.entities.brands.map((brand) => brand.toLowerCase().replace(/\s+/g, "-")),
    ...input.vision.entities.products.map((product) => product.toLowerCase().replace(/\s+/g, "-")),
  ]);

  return {
    summary,
    content_type: input.vision.contentType || "unknown",
    transcript,
    ocr_text: ocrText,
    entities: input.vision.entities,
    actions: input.vision.actions,
    key_facts: [
      input.fetchResult.metadata.creator && `Creator: ${input.fetchResult.metadata.creator}`,
      input.fetchResult.metadata.postId && `Post ID: ${input.fetchResult.metadata.postId}`,
      `Duration: ${input.preparedMedia.probe.durationSeconds.toFixed(2)}s`,
      input.preparedMedia.probe.hasAudio ? "Audio present" : "No audio track detected",
      input.vision.contentType && `Content type: ${input.vision.contentType}`,
    ].filter(Boolean) as string[],
    recommended_tags: [...recommendedTags].filter(Boolean),
    source: {
      reel_id: input.reelId,
      url: input.normalized.originalUrl,
      canonical_url: input.normalized.canonicalUrl,
      platform: input.normalized.platform,
    },
    metadata: {
      caption: input.fetchResult.metadata.caption ?? "",
      creator: input.fetchResult.metadata.creator ?? "",
      post_id: input.fetchResult.metadata.postId ?? "",
      posted_at: input.fetchResult.metadata.postedAt ?? "",
      thumbnail_url: input.fetchResult.metadata.thumbnailUrl ?? "",
    },
    media: {
      duration_seconds: input.preparedMedia.probe.durationSeconds,
      has_audio: input.preparedMedia.probe.hasAudio,
      width: input.preparedMedia.probe.width,
      height: input.preparedMedia.probe.height,
      format: input.preparedMedia.probe.format,
      video_codec: input.preparedMedia.probe.videoCodec,
      audio_codec: input.preparedMedia.probe.audioCodec,
    },
    diagnostics: {
      fetch_provider: input.fetchResult.diagnostics.provider,
      fetch_notes: input.fetchResult.diagnostics.notes,
      normalized_url_changed: input.normalized.normalizedChanged,
    },
  };
}

export async function buildStructuredOutput(input: {
  reelId: string;
  normalized: NormalizedReelUrl;
  fetchResult: FetchResult;
  preparedMedia: PreparedMedia;
  transcript: TranscriptResult;
  ocr: OcrResult;
  vision: VisionResult;
  mockMode: boolean;
}): Promise<ExtractedReelJson> {
  if (input.mockMode) {
    return buildHeuristicOutput(input);
  }

  const ocrText = input.ocr.items.map((item) => item.text);
  const response = await createVisionJson<z.infer<typeof structuredOutputSchema>>({
    stage: "output",
    model: env.OPENAI_STRUCTURED_MODEL,
    systemPrompt: STRUCTURED_OUTPUT_SYSTEM_PROMPT,
    userPrompt: buildStructuredOutputPrompt({
      url: input.normalized.canonicalUrl,
      metadataCaption: input.fetchResult.metadata.caption ?? "",
      creator: input.fetchResult.metadata.creator ?? "",
      transcript: input.transcript.fullText,
      ocrText,
      visionSummary: input.vision.summary,
      contentType: input.vision.contentType,
      entities: input.vision.entities,
      actions: input.vision.actions,
      sceneNotes: input.vision.sceneNotes,
    }),
  });

  const structured = structuredOutputSchema.parse(response);

  return {
    ...structured,
    source: {
      reel_id: input.reelId,
      url: input.normalized.originalUrl,
      canonical_url: input.normalized.canonicalUrl,
      platform: input.normalized.platform,
    },
    metadata: {
      caption: input.fetchResult.metadata.caption ?? "",
      creator: input.fetchResult.metadata.creator ?? "",
      post_id: input.fetchResult.metadata.postId ?? "",
      posted_at: input.fetchResult.metadata.postedAt ?? "",
      thumbnail_url: input.fetchResult.metadata.thumbnailUrl ?? "",
    },
    media: {
      duration_seconds: input.preparedMedia.probe.durationSeconds,
      has_audio: input.preparedMedia.probe.hasAudio,
      width: input.preparedMedia.probe.width,
      height: input.preparedMedia.probe.height,
      format: input.preparedMedia.probe.format,
      video_codec: input.preparedMedia.probe.videoCodec,
      audio_codec: input.preparedMedia.probe.audioCodec,
    },
    diagnostics: {
      fetch_provider: input.fetchResult.diagnostics.provider,
      fetch_notes: input.fetchResult.diagnostics.notes,
      normalized_url_changed: input.normalized.normalizedChanged,
    },
  };
}
