import type { TranscriptResult } from "../../types/pipeline.js";
import { env } from "../config/env.js";
import { transcribeWithOpenAi } from "../utils/openai.js";

export async function transcribeAudio(audioPath: string | null): Promise<TranscriptResult> {
  if (!audioPath) {
    return emptyTranscript();
  }

  if (env.REELTOR_AI_MODE === "mock") {
    return {
      fullText: "Quick mock transcript describing a short product demo with a simple call to action.",
      segments: [
        { start: 0, end: 2.5, text: "Here is a quick demo of the product in action." },
        { start: 2.5, end: 6, text: "Try it now if you want the faster workflow." },
      ],
      language: "en",
    };
  }

  const response = await transcribeWithOpenAi(audioPath);

  return {
    fullText: response.text ?? "",
    segments: (response.segments ?? []).map((segment) => ({
      start: Number(segment.start ?? 0),
      end: Number(segment.end ?? 0),
      text: segment.text ?? "",
    })),
    language: response.language ?? "",
  };
}

function emptyTranscript(): TranscriptResult {
  return {
    fullText: "",
    segments: [],
    language: "",
  };
}
