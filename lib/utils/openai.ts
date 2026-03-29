import { basename } from "node:path";
import { readFile } from "node:fs/promises";

import { env } from "../config/env.js";
import type { PipelineStage } from "../../types/pipeline.js";
import { PipelineError } from "./errors.js";
import { parseJsonObject } from "./json.js";

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

function makeApiError(stage: PipelineStage, response: Response, body: string): PipelineError {
  return new PipelineError({
    code: "OPENAI_REQUEST_FAILED",
    stage,
    retryable: response.status >= 500 || response.status === 429,
    message: `OpenAI request failed with HTTP ${response.status}.`,
    details: { status: response.status, body: body.slice(0, 2_000) },
  });
}

function getApiKey(stage: PipelineStage): string {
  if (!env.OPENAI_API_KEY) {
    throw new PipelineError({
      code: "OPENAI_NOT_CONFIGURED",
      stage,
      retryable: false,
      message: "OPENAI_API_KEY is required when REELTOR_AI_MODE=openai.",
    });
  }

  return env.OPENAI_API_KEY;
}

export async function transcribeWithOpenAi(audioPath: string): Promise<AudioTranscriptionResponse> {
  const file = await readFile(audioPath);
  const form = new FormData();
  form.set("model", env.REELTOR_TRANSCRIBE_MODEL);
  form.set("response_format", "verbose_json");
  form.set("timestamp_granularities[]", "segment");
  form.set("file", new File([file], basename(audioPath), { type: "audio/wav" }));

  let response: Response;

  try {
    response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getApiKey("transcription")}`,
      },
      body: form,
      signal: AbortSignal.timeout(env.REELTOR_REQUEST_TIMEOUT_MS * 3),
    });
  } catch (error) {
    throw new PipelineError({
      code: "OPENAI_NETWORK_ERROR",
      stage: "transcription",
      retryable: true,
      message: "OpenAI transcription request failed before receiving a response.",
      cause: error,
    });
  }

  const text = await response.text();

  if (!response.ok) {
    throw makeApiError("transcription", response, text);
  }

  return parseJsonObject<AudioTranscriptionResponse>(text, "transcription", "OPENAI_TRANSCRIPTION_JSON_INVALID");
}

export async function createVisionJson<T>(input: {
  stage: "ocr" | "vision";
  model: string;
  systemPrompt: string;
  userPrompt: string;
  imageDataUrls: string[];
}): Promise<T> {
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
            content: [
              { type: "text", text: input.userPrompt },
              ...input.imageDataUrls.map((imageUrl) => ({
                type: "image_url",
                image_url: {
                  url: imageUrl,
                },
              })),
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(env.REELTOR_REQUEST_TIMEOUT_MS * 3),
    });
  } catch (error) {
    throw new PipelineError({
      code: "OPENAI_NETWORK_ERROR",
      stage: input.stage,
      retryable: true,
      message: "OpenAI vision request failed before receiving a response.",
      cause: error,
    });
  }

  const raw = await response.text();

  if (!response.ok) {
    throw makeApiError(input.stage, response, raw);
  }

  const parsed = parseJsonObject<ChatCompletionResponse>(raw, input.stage, "OPENAI_CHAT_JSON_INVALID");
  const content = parsed.choices?.[0]?.message?.content;

  if (!content) {
    throw new PipelineError({
      code: "OPENAI_EMPTY_RESPONSE",
      stage: input.stage,
      retryable: true,
      message: "OpenAI returned an empty response body.",
    });
  }

  return parseJsonObject<T>(content, input.stage, "OPENAI_MODEL_JSON_INVALID");
}
