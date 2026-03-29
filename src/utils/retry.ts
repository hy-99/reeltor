import type { Logger } from "pino";

import { env } from "../config/env.js";
import type { PipelineStage } from "../types/pipeline.js";
import { PipelineError } from "../types/errors.js";
import { asPipelineError } from "./errors.js";

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetries<T>(input: {
  stage: PipelineStage;
  logger: Logger;
  taskName: string;
  run: () => Promise<T>;
  maxRetries?: number;
}): Promise<T> {
  const maxRetries = input.maxRetries ?? env.MAX_RETRIES;
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await input.run();
    } catch (error) {
      const pipelineError = asPipelineError(error, input.stage);

      if (!pipelineError.retryable || attempt >= maxRetries) {
        throw pipelineError;
      }

      const delayMs = Math.min(1_000 * 2 ** (attempt - 1), 8_000);
      input.logger.warn(
        {
          stage: input.stage,
          taskName: input.taskName,
          attempt,
          maxRetries,
          delayMs,
          code: pipelineError.code,
        },
        "Retrying transient stage failure.",
      );
      await sleep(delayMs);
    }
  }
}
