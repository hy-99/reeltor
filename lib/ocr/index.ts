import type { OcrResult, PreprocessedMedia } from "../../types/pipeline.js";
import { env } from "../config/env.js";
import { fileToDataUrl } from "../utils/files.js";
import { createVisionJson } from "../utils/openai.js";

interface OcrFrameResponse {
  texts?: string[];
}

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function extractOnScreenText(preprocessed: PreprocessedMedia): Promise<OcrResult> {
  if (preprocessed.frames.length === 0) {
    return { texts: [] };
  }

  if (env.REELTOR_AI_MODE === "mock") {
    return {
      texts: [
        { time: 0, text: "30 SECOND DEMO" },
        { time: 2.5, text: "TRY IT NOW" },
      ],
    };
  }

  const collected: Array<{ time: number; text: string }> = [];
  const seen = new Map<string, number>();

  for (const frame of preprocessed.frames) {
    const response = await createVisionJson<OcrFrameResponse>({
      stage: "ocr",
      model: env.REELTOR_OCR_MODEL,
      systemPrompt:
        "You extract only on-screen text from a single short-form video frame. Return JSON with shape {\"texts\": [\"...\"]}. Ignore spoken words that are not visible on screen. Do not hallucinate hidden text.",
      userPrompt:
        "Extract visible on-screen text from this frame. Keep the text concise and normalized, and omit decorative duplicates.",
      imageDataUrls: [await fileToDataUrl(frame.path, "image/jpeg")],
    });

    for (const text of response.texts ?? []) {
      const normalized = normalizeText(text);
      const previousTime = seen.get(normalized);

      if (previousTime !== undefined && Math.abs(previousTime - frame.time) <= env.REELTOR_FRAME_INTERVAL_SECONDS * 2) {
        continue;
      }

      seen.set(normalized, frame.time);
      collected.push({ time: frame.time, text: text.trim() });
    }
  }

  return { texts: collected };
}
