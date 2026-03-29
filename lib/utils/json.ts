import { PipelineError } from "./errors.js";
import type { PipelineStage } from "../../types/pipeline.js";

export function parseJsonObject<T>(input: string, stage: PipelineStage, code: string): T {
  try {
    return JSON.parse(input) as T;
  } catch (error) {
    throw new PipelineError({
      code,
      stage,
      retryable: true,
      message: "Model or subprocess returned invalid JSON.",
      details: { sample: input.slice(0, 500) },
      cause: error,
    });
  }
}
