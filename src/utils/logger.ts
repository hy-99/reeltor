import pino, { type Logger } from "pino";

import { env } from "../config/env.js";

export function createLogger(bindings?: Record<string, unknown>): Logger {
  return pino({
    level: env.LOG_LEVEL,
    base: {
      service: "reeltor",
      worker: env.WORKER_NAME,
      ...bindings,
    },
    timestamp: pino.stdTimeFunctions.isoTime,
  });
}
