import { env } from "../../config/env.js";
import type { OcrResult, PreparedMedia, TranscriptResult, VisionResult } from "../../types/pipeline.js";
import { imageFileToDataUrl } from "../../utils/files.js";
import { createVisionJson } from "../../utils/openai.js";

interface VisionResponse {
  summary?: string;
  content_type?: string;
  entities?: {
    people?: string[];
    products?: string[];
    brands?: string[];
    objects?: string[];
    places?: string[];
  };
  actions?: string[];
  scene_notes?: string[];
}

export async function analyzeVisualContent(input: {
  media: PreparedMedia;
  transcript: TranscriptResult;
  ocr: OcrResult;
  mockMode: boolean;
}): Promise<VisionResult> {
  if (input.mockMode) {
    return {
      summary: "A short mock product tutorial with a presenter demonstrating a mobile workflow and call to action.",
      contentType: "tutorial",
      entities: {
        people: ["presenter"],
        products: ["demo product"],
        brands: ["mock brand"],
        objects: ["smartphone", "desk"],
        places: ["indoor studio"],
      },
      actions: ["showing product workflow", "asking viewers to try it"],
      sceneNotes: input.media.frames.map((frame) => `Scene at ${frame.timeSeconds}s shows the staged product demo.`),
    };
  }

  const imageDataUrls = await Promise.all(
    input.media.frames.slice(0, env.MAX_FRAMES).map((frame) => imageFileToDataUrl(frame.path)),
  );

  const response = await createVisionJson<VisionResponse>({
    stage: "vision",
    model: env.OPENAI_VISION_MODEL,
    systemPrompt:
      "You analyze short-form video frames for a backend ingestion pipeline. Return JSON only with shape {\"summary\":\"\",\"content_type\":\"\",\"entities\":{\"people\":[],\"products\":[],\"brands\":[],\"objects\":[],\"places\":[]},\"actions\":[],\"scene_notes\":[]}. Be conservative and avoid hallucinations.",
    userPrompt: [
      "Analyze these frames from a reel and infer the reel-level visual meaning.",
      `Transcript context: ${input.transcript.fullText || "none"}`,
      `OCR context: ${input.ocr.items.map((item) => `${item.timeSeconds}s=${item.text}`).join(" | ") || "none"}`,
      "Identify people, products, brands, objects, places, actions, and classify the content type such as tutorial, ad, review, meme, news, or lifestyle.",
    ].join("\n"),
    imageDataUrls,
  });

  return {
    summary: response.summary ?? "",
    contentType: response.content_type ?? "",
    entities: {
      people: response.entities?.people ?? [],
      products: response.entities?.products ?? [],
      brands: response.entities?.brands ?? [],
      objects: response.entities?.objects ?? [],
      places: response.entities?.places ?? [],
    },
    actions: response.actions ?? [],
    sceneNotes: response.scene_notes ?? [],
  };
}
