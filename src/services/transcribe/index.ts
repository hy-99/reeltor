import { PipelineError } from "../../types/errors.js";
import type { TranscriptResult } from "../../types/pipeline.js";
import { transcribeAudioWithOpenAi } from "../../utils/openai.js";

function emptyTranscript(): TranscriptResult {
  return {
    fullText: "",
    segments: [],
    language: "",
  };
}

export async function transcribeAudio(input: {
  audioPath: string | null;
  mockMode: boolean;
}): Promise<TranscriptResult> {
  if (!input.audioPath) {
    return emptyTranscript();
  }

  if (input.mockMode) {
    return {
      fullText: "Mock transcript for a short reel showing a product walkthrough and a clear call to action.",
      segments: [
        {
          startSeconds: 0,
          endSeconds: 2.5,
          text: "This reel quickly demonstrates the product workflow.",
        },
        {
          startSeconds: 2.5,
          endSeconds: 6,
          text: "The speaker encourages viewers to try the product now.",
        },
      ],
      language: "en",
    };
  }

  const response = await transcribeAudioWithOpenAi(input.audioPath).catch((error) => {
    throw new PipelineError({
      code: "TRANSCRIPTION_FAILED",
      stage: "transcribe",
      retryable: true,
      message: "Audio transcription failed.",
      cause: error,
    });
  });

  return {
    fullText: response.text ?? "",
    segments: (response.segments ?? []).map((segment) => ({
      startSeconds: Number(segment.start ?? 0),
      endSeconds: Number(segment.end ?? 0),
      text: segment.text ?? "",
    })),
    language: response.language ?? "",
  };
}
