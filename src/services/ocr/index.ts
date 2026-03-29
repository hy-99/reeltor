import { env } from "../../config/env.js";
import type { OcrResult, PreparedMedia } from "../../types/pipeline.js";
import { imageFileToDataUrl } from "../../utils/files.js";
import { createVisionJson } from "../../utils/openai.js";

interface OcrFrameResponse {
  texts?: string[];
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

export async function extractOnScreenText(input: {
  media: PreparedMedia;
  mockMode: boolean;
}): Promise<OcrResult> {
  if (input.media.frames.length === 0) {
    return { items: [] };
  }

  if (input.mockMode) {
    return {
      items: [
        { timeSeconds: 0, text: "30 SECOND DEMO" },
        { timeSeconds: 3, text: "TRY IT NOW" },
      ],
    };
  }

  const items: OcrResult["items"] = [];
  const lastSeenAt = new Map<string, number>();

  for (const frame of input.media.frames) {
    const imageDataUrl = await imageFileToDataUrl(frame.path);
    const response = await createVisionJson<OcrFrameResponse>({
      stage: "ocr",
      model: env.OPENAI_VISION_MODEL,
      systemPrompt:
        "Extract only visible on-screen text from the provided reel frame. Return JSON with shape {\"texts\":[\"...\"]}. Do not infer hidden or spoken text.",
      userPrompt:
        "Read the visible on-screen text from this video frame. Return concise, normalized text strings. Ignore decorative duplicates and background clutter.",
      imageDataUrls: [imageDataUrl],
    });

    for (const text of response.texts ?? []) {
      const key = normalize(text);
      const previous = lastSeenAt.get(key);

      if (previous !== undefined && Math.abs(previous - frame.timeSeconds) <= env.FRAME_INTERVAL_SECONDS * 2) {
        continue;
      }

      lastSeenAt.set(key, frame.timeSeconds);
      items.push({
        timeSeconds: frame.timeSeconds,
        text: text.trim(),
      });
    }
  }

  return { items };
}
