import { basename } from "node:path";
import { readFile } from "node:fs/promises";

import { env } from "../config/env.js";
import { PipelineError } from "../types/errors.js";
import type { PipelineStage } from "../types/pipeline.js";
import { parseJson } from "./json.js";

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface AudioTranscriptionResponse {
  text?: string;
  language?: string;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
}

function getApiKey(stage: PipelineStage): string {
  if (!env.OPENAI_API_KEY) {
    throw new PipelineError({
      code: "OPENAI_NOT_CONFIGURED",
      stage,
      retryable: false,
      message: "OPENAI_API_KEY is required for non-mock OpenAI processing.",
    });
  }

  return env.OPENAI_API_KEY;
}

function makeApiError(stage: PipelineStage, response: Response, body: string): PipelineError {
  return new PipelineError({
    code: "OPENAI_REQUEST_FAILED",
    stage,
    retryable: response.status >= 500 || response.status === 429,
    message: `OpenAI request failed with HTTP ${response.status}.`,
    details: { status: response.status, body: body.slice(0, 2_000) },
  });
}

export async function transcribeAudioWithOpenAi(audioPath: string): Promise<AudioTranscriptionResponse> {
  const buffer = await readFile(audioPath);
  const form = new FormData();
  form.set("model", env.OPENAI_TRANSCRIBE_MODEL);
  form.set("response_format", "verbose_json");
  form.set("timestamp_granularities[]", "segment");
  form.set("file", new File([buffer], basename(audioPath), { type: "audio/wav" }));

  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey("transcribe")}`,
      },
      body: form,
      signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS * 3),
    });
  } catch (error) {
    throw new PipelineError({
      code: "OPENAI_NETWORK_ERROR",
      stage: "transcribe",
      retryable: true,
      message: "OpenAI transcription request failed before a response was received.",
      cause: error,
    });
  }

  const body = await response.text();

  if (!response.ok) {
    throw makeApiError("transcribe", response, body);
  }

  return parseJson<AudioTranscriptionResponse>(body, "transcribe", "OPENAI_TRANSCRIPTION_JSON_INVALID");
}

export async function createVisionJson<T>(input: {
  stage: "ocr" | "vision" | "output";
  model: string;
  systemPrompt: string;
  userPrompt: string;
  imageDataUrls?: string[];
}): Promise<T> {
  const content = [
    {
      type: "text",
      text: input.userPrompt,
    },
    ...(input.imageDataUrls ?? []).map((imageUrl) => ({
      type: "image_url",
      image_url: {
        url: imageUrl,
      },
    })),
  ];

  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${getApiKey(input.stage)}`,
      },
      body: JSON.stringify({
        model: input.model,
        response_format: { type: "json_object" },
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content: input.systemPrompt,
          },
          {
            role: "user",
            content,
          },
        ],
      }),
      signal: AbortSignal.timeout(env.REQUEST_TIMEOUT_MS * 3),
    });
  } catch (error) {
    throw new PipelineError({
      code: "OPENAI_NETWORK_ERROR",
      stage: input.stage,
      retryable: true,
      message: "OpenAI structured request failed before a response was received.",
      cause: error,
    });
  }

  const body = await response.text();

  if (!response.ok) {
    throw makeApiError(input.stage, response, body);
  }

  const parsed = parseJson<ChatCompletionResponse>(body, input.stage, "OPENAI_CHAT_JSON_INVALID");
  const message = parsed.choices?.[0]?.message?.content;

  if (!message) {
    throw new PipelineError({
      code: "OPENAI_EMPTY_RESPONSE",
      stage: input.stage,
      retryable: true,
      message: "OpenAI returned an empty structured response.",
    });
  }

  return parseJson<T>(message, input.stage, "OPENAI_MODEL_JSON_INVALID");
}
