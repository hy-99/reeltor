import type { VisionEntities } from "../../types/pipeline.js";

export const STRUCTURED_OUTPUT_SYSTEM_PROMPT =
  "You are a backend extraction engine for short-form social video. Return JSON only. Keep fields stable, concise, and programmatically useful. Never return prose outside JSON.";

export function buildStructuredOutputPrompt(input: {
  url: string;
  metadataCaption: string;
  creator: string;
  transcript: string;
  ocrText: string[];
  visionSummary: string;
  contentType: string;
  entities: VisionEntities;
  actions: string[];
  sceneNotes: string[];
}): string {
  return [
    "Create a final structured extraction object for a reel.",
    'Return JSON with exactly these keys: {"summary":"","content_type":"","transcript":"","ocr_text":[],"entities":{"people":[],"products":[],"brands":[],"objects":[],"places":[]},"actions":[],"key_facts":[],"recommended_tags":[]}.',
    `URL: ${input.url}`,
    `Caption: ${input.metadataCaption || "none"}`,
    `Creator: ${input.creator || "unknown"}`,
    `Transcript: ${input.transcript || "none"}`,
    `OCR: ${input.ocrText.join(" | ") || "none"}`,
    `Vision summary: ${input.visionSummary || "none"}`,
    `Vision content type hint: ${input.contentType || "unknown"}`,
    `Entities: ${JSON.stringify(input.entities)}`,
    `Actions: ${JSON.stringify(input.actions)}`,
    `Scene notes: ${JSON.stringify(input.sceneNotes)}`,
    "The summary should be concise. key_facts should be short factual bullets. recommended_tags should be lower-case, hyphenated where helpful, and relevant for retrieval.",
  ].join("\n");
}
