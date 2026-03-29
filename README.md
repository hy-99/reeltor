# Reeltor

Reeltor is a backend worker for reel ingestion that uses the existing `reels` table directly.

It reads rows where `reels.status = 'processing'`, safely claims them with PostgreSQL advisory locks, fetches and processes the underlying reel media, extracts structured agent-ready output, and writes the results back into the same row.

## Existing Schema Assumptions

Reeltor is built around this existing table:

```sql
reels (
  id TEXT PRIMARY KEY,
  url TEXT UNIQUE NOT NULL,
  transcript TEXT NULL,
  description TEXT NULL,
  collection TEXT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  error_message TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
)
```

Status values are used exactly as provided:

- `processing`
- `complete`
- `error`

No separate jobs table is used.

## Minimal Schema Extension

To persist the full structured output, apply:

```sql
ALTER TABLE reels
ADD COLUMN IF NOT EXISTS extracted_json JSONB;
```

The migration file is [sql/001_add_extracted_json.sql](/Users/hy/Hackathon%20Project/reeltor/sql/001_add_extracted_json.sql).

If `extracted_json` is not present yet, the worker still runs and persists `transcript`, `description`, `status`, and `error_message`.

## Project Layout

- `src/config`
  env parsing and runtime config
- `src/db`
  Neon/Postgres connection and `reels` repository
- `src/types`
  shared worker types
- `src/workers`
  long-running worker loop
- `src/services/fetcher`
  mock fetcher, direct media fetcher, public reel fetch adapter
- `src/services/media`
  ffprobe validation and ffmpeg preprocessing
- `src/services/transcribe`
  audio transcription
- `src/services/ocr`
  on-screen text extraction
- `src/services/vision`
  visual analysis
- `src/services/output`
  centralized prompts and final structured output builder
- `src/services/indexing`
  search chunk preparation and `embedding_chunks` insertion path
- `scripts`
  single-item local test command

## Environment

Start from [.env.example](/Users/hy/Hackathon%20Project/reeltor/.env.example).

Required:

- `DATABASE_URL`
- `OPENAI_API_KEY`

Core worker config:

- `POLL_INTERVAL_MS`
- `BATCH_SIZE`
- `MAX_RETRIES`
- `TEMP_DIR`
- `LOG_LEVEL`
- `ENABLE_MOCK_FETCH`
- `DEBUG_KEEP_TEMP_FILES`

Useful optional runtime config:

- `YT_DLP_PATH`
- `FFMPEG_PATH`
- `FFPROBE_PATH`
- `OPENAI_TRANSCRIBE_MODEL`
- `OPENAI_VISION_MODEL`
- `OPENAI_STRUCTURED_MODEL`

## Security Notes

- OpenAI calls are server-side only.
- `OPENAI_API_KEY` is read only from environment variables.
- No client code is generated here.
- Secrets are not written into the codebase.

Because credentials were pasted into chat, rotate them before using this in production.

## How Claiming Works

The schema does not include a separate claim status, so Reeltor uses PostgreSQL advisory locks keyed by `reels.id`.

That gives us:

- safe multi-worker concurrency
- no extra job table
- no invented statuses
- automatic lock release if a worker process dies

Rows remain `processing` until they are successfully written as `complete` or updated to `error`.

`MAX_RETRIES` applies to transient stage retries within a single processing attempt, such as fetch or OpenAI calls. Because the existing schema does not include a retry counter or lease timestamp, failed rows are not auto-requeued by the worker. To retry a failed row, set its status back to `processing`.

## Processing Flow

1. Poll `reels` for rows where `status = 'processing'`
2. Claim rows with advisory locks
3. Normalize and validate `url`
4. Fetch public reel media if possible
5. Verify media with `ffprobe`
6. Normalize media and extract audio/frames with `ffmpeg`
7. Transcribe audio with OpenAI
8. Extract OCR from frames
9. Analyze frames for vision meaning
10. Build final structured JSON
11. Save:
   `reels.transcript`
   `reels.description`
   `reels.extracted_json` if present
   `reels.status = 'complete'`
   `reels.error_message = null`
12. On failure, save:
   `reels.status = 'error'`
   `reels.error_message = <detailed reason>`

## Structured Output

The stored JSON includes at least:

```json
{
  "summary": "",
  "content_type": "",
  "transcript": "",
  "ocr_text": [],
  "entities": {
    "people": [],
    "products": [],
    "brands": [],
    "objects": [],
    "places": []
  },
  "actions": [],
  "key_facts": [],
  "recommended_tags": []
}
```

It also includes source, media, metadata, and diagnostics sections for downstream agent use.

## Search Indexing Follow-up

After successful extraction, the worker prepares search chunks and attempts to insert them into `embedding_chunks` when that table is available and compatible.

`vec_embeddings` support is intentionally left behind a clear boundary because its exact column contract was not provided. The code is structured in [src/services/indexing/reel-indexer.ts](/Users/hy/Hackathon%20Project/reeltor/src/services/indexing/reel-indexer.ts) so that vector writeback can be added without changing the worker flow.

## Local Setup

1. Install dependencies.

```bash
npm install
```

2. Copy the env file.

```bash
cp .env.example .env.local
```

3. Put `DATABASE_URL` and `OPENAI_API_KEY` into `.env.local`.

4. Apply the `extracted_json` migration if you want full JSON persistence.

5. Start the worker.

```bash
npm run worker
```

## Single Reel Local Test

Run the built-in local mock reel:

```bash
npm run worker:test
```

Override with a specific URL:

```bash
npm run worker:test -- "https://example.com/video.mp4"
```

The default fixture is [fixtures/local-test-record.json](/Users/hy/Hackathon%20Project/reeltor/fixtures/local-test-record.json) and uses `mock://sample-reel/product-demo`.

## Commands

- `npm run worker`
  start the long-running Neon worker
- `npm run worker:test`
  run the single-item local test path
- `npm run check`
  run TypeScript validation
