import type { PipelineStage } from "./pipeline.js";

export interface ErrorDetails {
  [key: string]: unknown;
}

export class PipelineError extends Error {
  readonly code: string;
  readonly stage: PipelineStage;
  readonly retryable: boolean;
  readonly details?: ErrorDetails;

  constructor(input: {
    code: string;
    stage: PipelineStage;
    retryable: boolean;
    message: string;
    details?: ErrorDetails;
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
