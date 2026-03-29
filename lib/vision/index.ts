import type { OcrResult, PreprocessedMedia, TranscriptResult, VisionResult } from "../../types/pipeline.js";
import { env } from "../config/env.js";
import { fileToDataUrl } from "../utils/files.js";
import { createVisionJson } from "../utils/openai.js";

interface VisionResponse {
  content_type?: string;
  summary?: string;
  entities?: {
    people?: string[];
    products?: string[];
    brands?: string[];
    objects?: string[];
    places?: string[];
  };
  actions?: string[];
  scenes?: Array<{
    time?: number;
    description?: string;
  }>;
}

export async function analyzeVisualContent(input: {
  preprocessed: PreprocessedMedia;
  transcript: TranscriptResult;
  ocr: OcrResult;
}): Promise<VisionResult> {
  if (env.REELTOR_AI_MODE === "mock") {
    return {
      contentType: "tutorial",
      summary: "A short mock product tutorial showing a phone-based workflow with a direct call to action.",
      entities: {
        people: ["presenter"],
        products: ["demo product"],
        brands: ["mock brand"],
        objects: ["smartphone", "desk"],
        places: ["indoor studio"],
      },
      actions: ["demonstrating feature", "encouraging signup"],
      scenes: input.preprocessed.frames.map((frame) => ({
        time: frame.time,
        description: `Mock scene around ${frame.time}s showing the product demonstration.`,
      })),
    };
  }

  if (input.preprocessed.frames.length === 0) {
    return emptyVisionResult();
  }

  const imageDataUrls = await Promise.all(
    input.preprocessed.frames.slice(0, env.REELTOR_MAX_FRAMES).map((frame) => fileToDataUrl(frame.path, "image/jpeg")),
  );

  const response = await createVisionJson<VisionResponse>({
    stage: "vision",
    model: env.REELTOR_VISION_MODEL,
    systemPrompt:
      "You analyze short-form video frames for downstream agents. Return JSON only with shape {\"content_type\":\"\",\"summary\":\"\",\"entities\":{\"people\":[],\"products\":[],\"brands\":[],\"objects\":[],\"places\":[]},\"actions\":[],\"scenes\":[{\"time\":0,\"description\":\"\"}]}. Be conservative and do not invent details that are not visually supported.",
    userPrompt: [
      "Analyze these frames from a reel and summarize the reel-level meaning.",
      `Transcript context: ${input.transcript.fullText || "none"}`,
      `OCR context: ${input.ocr.texts.map((item) => `${item.time}s=${item.text}`).join(" | ") || "none"}`,
      "Infer main topic, entities, actions, scene descriptions, and classify the reel as tutorial, ad, review, meme, news, lifestyle, or another concise label.",
    ].join("\n"),
    imageDataUrls,
  });

  return {
    contentType: response.content_type ?? "",
    summary: response.summary ?? "",
    entities: {
      people: response.entities?.people ?? [],
      products: response.entities?.products ?? [],
      brands: response.entities?.brands ?? [],
      objects: response.entities?.objects ?? [],
      places: response.entities?.places ?? [],
    },
    actions: response.actions ?? [],
    scenes: (response.scenes ?? []).map((scene) => ({
      time: Number(scene.time ?? 0),
      description: scene.description ?? "",
    })),
  };
}

function emptyVisionResult(): VisionResult {
  return {
    contentType: "",
    summary: "",
    entities: {
      people: [],
      products: [],
      brands: [],
      objects: [],
      places: [],
    },
    actions: [],
    scenes: [],
  };
}
