import type { Logger } from "pino";

import { PipelineError } from "../types/errors.js";
import type { PipelineStage } from "../types/pipeline.js";

export function asPipelineError(error: unknown, fallbackStage: PipelineStage): PipelineError {
  if (error instanceof PipelineError) {
    return error;
  }

  if (error instanceof Error) {
    return new PipelineError({
      code: "UNEXPECTED_ERROR",
      stage: fallbackStage,
      retryable: true,
      message: error.message,
      cause: error,
    });
  }

  return new PipelineError({
    code: "UNEXPECTED_THROWN_VALUE",
    stage: fallbackStage,
    retryable: false,
    message: "The pipeline failed with a non-Error value.",
    details: { value: String(error) },
  });
}

export function formatErrorMessage(error: PipelineError): string {
  const details = error.details ? ` | details=${JSON.stringify(error.details)}` : "";
  return `${error.stage} [${error.code}] retryable=${error.retryable} ${error.message}${details}`.slice(0, 8_000);
}

export function logPipelineError(logger: Logger, error: PipelineError, message: string): void {
  logger.error(
    {
      err: error,
      code: error.code,
      stage: error.stage,
      retryable: error.retryable,
      details: error.details,
    },
    message,
  );
}
