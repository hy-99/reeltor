import { PipelineError } from "../types/errors.js";
import type { PipelineStage } from "../types/pipeline.js";

export function parseJson<T>(value: string, stage: PipelineStage, code: string): T {
  try {
    return JSON.parse(value) as T;
  } catch (error) {
    throw new PipelineError({
      code,
      stage,
      retryable: true,
      message: "Received invalid JSON.",
      details: { sample: value.slice(0, 500) },
      cause: error,
    });
  }
}
