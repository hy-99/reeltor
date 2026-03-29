import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  OPENAI_API_KEY: z.string().min(1).optional(),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  BATCH_SIZE: z.coerce.number().int().positive().default(5),
  MAX_RETRIES: z.coerce.number().int().positive().default(3),
  TEMP_DIR: z.string().min(1).default("./tmp"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  ENABLE_MOCK_FETCH: z.coerce.boolean().default(false),
  DEBUG_KEEP_TEMP_FILES: z.coerce.boolean().default(false),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  FRAME_INTERVAL_SECONDS: z.coerce.number().positive().default(1.5),
  MAX_FRAMES: z.coerce.number().int().positive().default(8),
  NORMALIZED_VIDEO_WIDTH: z.coerce.number().int().positive().default(720),
  NORMALIZED_VIDEO_HEIGHT: z.coerce.number().int().positive().default(1280),
  YT_DLP_PATH: z.string().optional(),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  OPENAI_TRANSCRIBE_MODEL: z.string().default("gpt-4o-mini-transcribe"),
  OPENAI_VISION_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_STRUCTURED_MODEL: z.string().default("gpt-4.1-mini"),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  LOCAL_TEST_FIXTURE: z.string().default("fixtures/local-test-record.json"),
  WORKER_NAME: z.string().default("reeltor-worker"),
});

export const env = envSchema.parse(process.env);

export function requireDatabaseUrl(): string {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for worker mode.");
  }

  return env.DATABASE_URL;
}
