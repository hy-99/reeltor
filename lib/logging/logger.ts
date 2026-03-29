import pino, { type Logger } from "pino";

import { env } from "../config/env.js";

export function createLogger(bindings?: Record<string, unknown>): Logger {
  return pino({
    level: env.REELTOR_LOG_LEVEL,
    base: {
      service: "reeltor",
      worker: env.REELTOR_WORKER_NAME,
      ...bindings,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
