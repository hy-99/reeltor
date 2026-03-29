import type { Logger } from "pino";
import type { Pool } from "pg";

import type { ClaimedReelJob, PersistedFailure, ReelStructuredOutput } from "../../types/pipeline.js";
import { env } from "../config/env.js";
import { quoteIdentifier, quoteQualifiedName, splitQualifiedName } from "./identifiers.js";
import { PipelineError } from "../utils/errors.js";

interface ClaimRow {
  id: string | number;
  reel_url: string;
  status: "pending" | "processing" | "completed" | "failed";
  retry_count: number;
  last_attempt_at: Date | null;
}

export class ReelJobsRepository {
  private readonly sourceTable = quoteQualifiedName(env.REELTOR_SOURCE_TABLE);
  private readonly sourceIdColumn = quoteIdentifier(env.REELTOR_SOURCE_ID_COLUMN);
  private readonly sourceUrlColumn = quoteIdentifier(env.REELTOR_SOURCE_URL_COLUMN);
  private readonly processingTable = quoteQualifiedName(env.REELTOR_PROCESSING_TABLE);
  private readonly processingTableAlias = "rp";

  constructor(
    private readonly pool: Pool,
    private readonly logger: Logger,
  ) {}

  async validateSchema(): Promise<void> {
    await this.assertTableExists(env.REELTOR_SOURCE_TABLE);
    await this.assertTableExists(env.REELTOR_PROCESSING_TABLE);

    await this.assertColumns(env.REELTOR_SOURCE_TABLE, [
      env.REELTOR_SOURCE_ID_COLUMN,
      env.REELTOR_SOURCE_URL_COLUMN,
    ]);

    await this.assertColumns(env.REELTOR_PROCESSING_TABLE, [
      "source_id",
      "reel_url",
      "status",
      "retry_count",
      "processed_at",
      "extracted_data_json",
      "error_message",
      "last_attempt_at",
      "canonical_url",
      "created_at",
      "updated_at",
    ]);
  }

  async claimPendingJobs(limit = env.REELTOR_BATCH_SIZE): Promise<ClaimedReelJob[]> {
    const client = await this.pool.connect();

    try {
      await client.query("BEGIN");

      const claimQuery = `
        WITH candidates AS (
          SELECT
            s.${this.sourceIdColumn}::text AS id,
            s.${this.sourceUrlColumn} AS reel_url
          FROM ${this.sourceTable} s
          LEFT JOIN ${this.processingTable} ${this.processingTableAlias}
            ON ${this.processingTableAlias}.source_id = s.${this.sourceIdColumn}::text
          WHERE (
            ${this.processingTableAlias}.source_id IS NULL
            OR ${this.processingTableAlias}.status = 'pending'
            OR (
              ${this.processingTableAlias}.status = 'failed'
              AND COALESCE(${this.processingTableAlias}.retry_count, 0) < $1
              AND (
                ${this.processingTableAlias}.last_attempt_at IS NULL
                OR ${this.processingTableAlias}.last_attempt_at <= NOW() - (
                  ($2::bigint * POWER(2, GREATEST(COALESCE(${this.processingTableAlias}.retry_count, 1) - 1, 0))::bigint) * INTERVAL '1 millisecond'
                )
              )
            )
          )
          ORDER BY s.${this.sourceIdColumn}
          FOR UPDATE OF s SKIP LOCKED
          LIMIT $3
        ),
        claimed AS (
          INSERT INTO ${this.processingTable} AS ${this.processingTableAlias} (
            source_id,
            reel_url,
            status,
            retry_count,
            processed_at,
            extracted_data_json,
            error_message,
            last_attempt_at,
            canonical_url,
            created_at,
            updated_at
          )
          SELECT
            c.id,
            c.reel_url,
            'processing',
            1,
            NULL,
            NULL,
            NULL,
            NOW(),
            NULL,
            NOW(),
            NOW()
          FROM candidates c
          ON CONFLICT (source_id) DO UPDATE
          SET
            reel_url = EXCLUDED.reel_url,
            status = 'processing',
            retry_count = ${this.processingTableAlias}.retry_count + 1,
            error_message = NULL,
            last_attempt_at = NOW(),
            updated_at = NOW()
          RETURNING source_id, status, retry_count, last_attempt_at
        )
        SELECT
          c.source_id AS id,
          s.${this.sourceUrlColumn} AS reel_url,
          c.status,
          c.retry_count,
          c.last_attempt_at
        FROM claimed c
        JOIN ${this.sourceTable} s
          ON s.${this.sourceIdColumn}::text = c.source_id
        ORDER BY c.source_id
      `;

      const result = await client.query<ClaimRow>(claimQuery, [
        env.REELTOR_MAX_RETRIES,
        env.REELTOR_RETRY_BASE_DELAY_MS,
        limit,
      ]);

      await client.query("COMMIT");

      return result.rows.map((row) => ({
        id: String(row.id),
        reelUrl: row.reel_url,
        status: row.status,
        retryCount: row.retry_count,
        lastAttemptAt: row.last_attempt_at ? row.last_attempt_at.toISOString() : null,
      }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async markCompleted(input: {
    recordId: string;
    canonicalUrl: string;
    output: ReelStructuredOutput;
  }): Promise<void> {
    await this.pool.query(
      `
        UPDATE ${this.processingTable}
        SET
          status = 'completed',
          processed_at = NOW(),
          extracted_data_json = $2::jsonb,
          error_message = NULL,
          canonical_url = $3,
          updated_at = NOW()
        WHERE source_id = $1
      `,
      [input.recordId, JSON.stringify(input.output), input.canonicalUrl],
    );
  }

  async markFailed(input: { recordId: string; canonicalUrl: string | null; failure: PersistedFailure }): Promise<void> {
    const message = formatPersistedFailure(input.failure);

    await this.pool.query(
      `
        UPDATE ${this.processingTable}
        SET
          status = 'failed',
          error_message = $2,
          canonical_url = COALESCE($3, canonical_url),
          updated_at = NOW()
        WHERE source_id = $1
      `,
      [input.recordId, message, input.canonicalUrl],
    );
  }

  private async assertTableExists(tableName: string): Promise<void> {
    const result = await this.pool.query<{ regclass: string | null }>("SELECT to_regclass($1) AS regclass", [tableName]);

    if (!result.rows[0]?.regclass) {
      throw new PipelineError({
        code: "TABLE_NOT_FOUND",
        stage: "database-read",
        retryable: false,
        message: `Required table does not exist: ${tableName}`,
      });
    }
  }

  private async assertColumns(tableName: string, expectedColumns: string[]): Promise<void> {
    const { schema, table } = splitQualifiedName(tableName);
    const result = await this.pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = $2
      `,
      [schema, table],
    );

    const existing = new Set(result.rows.map((row) => row.column_name));
    const missing = expectedColumns.filter((column) => !existing.has(column));

    if (missing.length > 0) {
      throw new PipelineError({
        code: "SCHEMA_MISMATCH",
        stage: "database-read",
        retryable: false,
        message: `Missing required columns on ${tableName}: ${missing.join(", ")}`,
        details: { tableName, missing },
      });
    }

    this.logger.debug({ tableName, expectedColumns }, "Validated table columns.");
  }
}

function formatPersistedFailure(failure: PersistedFailure): string {
  const details = failure.details ? ` | details=${JSON.stringify(failure.details)}` : "";
  return `${failure.stage} [${failure.code}] retryable=${failure.retryable} ${failure.message}${details}`.slice(0, 8_000);
}
