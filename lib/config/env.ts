import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  REELTOR_SOURCE_TABLE: z.string().min(1).default("reel_source_urls"),
  REELTOR_SOURCE_ID_COLUMN: z.string().min(1).default("id"),
  REELTOR_SOURCE_URL_COLUMN: z.string().min(1).default("reel_url"),
  REELTOR_PROCESSING_TABLE: z.string().min(1).default("reel_processing"),
  REELTOR_DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  REELTOR_LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  REELTOR_BATCH_SIZE: z.coerce.number().int().positive().default(5),
  REELTOR_POLL_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  REELTOR_MAX_RETRIES: z.coerce.number().int().positive().default(3),
  REELTOR_RETRY_BASE_DELAY_MS: z.coerce.number().int().positive().default(30_000),
  REELTOR_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  REELTOR_WORKER_NAME: z.string().min(1).default("reeltor-worker"),
  REELTOR_FETCH_MODE: z.enum(["auto", "yt-dlp", "direct", "mock"]).default("auto"),
  REELTOR_YT_DLP_PATH: z.string().optional(),
  REELTOR_TMP_DIR: z.string().min(1).default("./tmp"),
  REELTOR_DEBUG_KEEP_TEMP: z.coerce.boolean().default(false),
  REELTOR_FRAME_INTERVAL_SECONDS: z.coerce.number().positive().default(1.5),
  REELTOR_MAX_FRAMES: z.coerce.number().int().positive().default(8),
  REELTOR_OUTPUT_VIDEO_HEIGHT: z.coerce.number().int().positive().default(1280),
  REELTOR_OUTPUT_VIDEO_WIDTH: z.coerce.number().int().positive().default(720),
  REELTOR_AI_MODE: z.enum(["mock", "openai"]).default("mock"),
  OPENAI_API_KEY: z.string().optional(),
  REELTOR_TRANSCRIBE_MODEL: z.string().min(1).default("gpt-4o-mini-transcribe"),
  REELTOR_OCR_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  REELTOR_VISION_MODEL: z.string().min(1).default("gpt-4.1-mini"),
  REELTOR_LOCAL_TEST_FIXTURE: z.string().min(1).default("fixtures/local-test-record.json"),
});

const parsed = envSchema.parse(process.env);

if (parsed.REELTOR_AI_MODE === "openai" && !parsed.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required when REELTOR_AI_MODE=openai.");
}

export const env = parsed;
