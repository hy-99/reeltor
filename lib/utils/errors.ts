import type { PersistedFailure, PipelineStage } from "../../types/pipeline.js";

export class PipelineError extends Error {
  readonly code: string;
  readonly stage: PipelineStage;
  readonly retryable: boolean;
  readonly details?: Record<string, unknown>;

  constructor(input: {
    code: string;
    stage: PipelineStage;
    retryable: boolean;
    message: string;
    details?: Record<string, unknown>;
    cause?: unknown;
  }) {
    super(input.message, input.cause ? { cause: input.cause } : undefined);
    this.name = "PipelineError";
    this.code = input.code;
    this.stage = input.stage;
    this.retryable = input.retryable;
    this.details = input.details;
  }
}

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
    code: "UNEXPECTED_NON_ERROR",
    stage: fallbackStage,
    retryable: false,
    message: "The pipeline failed with a non-Error throwable.",
    details: { thrown: String(error) },
  });
}

export function toPersistedFailure(error: PipelineError): PersistedFailure {
  return {
    stage: error.stage,
    code: error.code,
    retryable: error.retryable,
    message: error.message,
    details: error.details,
  };
}

export function formatFailureMessage(failure: PersistedFailure): string {
  const base = `${failure.stage} [${failure.code}] ${failure.message}`;
  if (!failure.details || Object.keys(failure.details).length === 0) {
    return base;
  }

  return `${base} | details=${JSON.stringify(failure.details)}`.slice(0, 8_000);
}
