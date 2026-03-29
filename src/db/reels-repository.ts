import type { Logger } from "pino";
import type { Pool, PoolClient } from "pg";

import type { SchemaCapabilities, ClaimedReelJob, ExtractedReelJson, SearchIndexChunk } from "../types/pipeline.js";
import { PipelineError } from "../types/errors.js";
import { formatErrorMessage } from "../utils/errors.js";

interface CandidateRow {
  id: string;
  url: string;
  created_at: Date;
}

interface BoolRow {
  locked: boolean;
}

export interface ClaimedReelLease {
  job: ClaimedReelJob;
  markComplete(input: {
    transcript: string;
    description: string;
    extractedJson: ExtractedReelJson;
    hasExtractedJsonColumn: boolean;
  }): Promise<void>;
  markError(error: PipelineError): Promise<void>;
  release(): Promise<void>;
}

export class ReelsRepository {
  constructor(
    private readonly pool: Pool,
    private readonly logger: Logger,
  ) {}

  async validateSchema(): Promise<SchemaCapabilities> {
    await this.assertTableExists("reels");

    const reelColumns = await this.getTableColumns("reels");
    const requiredReels = ["id", "url", "transcript", "description", "collection", "status", "error_message", "created_at"];
    const missing = requiredReels.filter((column) => !reelColumns.has(column));

    if (missing.length > 0) {
      throw new PipelineError({
        code: "SCHEMA_MISMATCH",
        stage: "database-claim",
        retryable: false,
        message: `The reels table is missing required columns: ${missing.join(", ")}`,
      });
    }

    return {
      hasExtractedJson: reelColumns.has("extracted_json"),
      hasEmbeddingChunks: await this.hasTable("embedding_chunks"),
      hasVecEmbeddings: await this.hasTable("vec_embeddings"),
    };
  }

  async claimProcessingJobs(limit: number): Promise<ClaimedReelLease[]> {
    const oversample = Math.max(limit * 5, limit);
    const result = await this.pool.query<CandidateRow>(
      `
        SELECT id, url, created_at
        FROM reels
        WHERE status = 'processing'
        ORDER BY created_at ASC, id ASC
        LIMIT $1
      `,
      [oversample],
    );

    const leases: ClaimedReelLease[] = [];

    for (const row of result.rows) {
      if (leases.length >= limit) {
        break;
      }

      const lease = await this.tryClaim(row);

      if (lease) {
        leases.push(lease);
      }
    }

    return leases;
  }

  async insertEmbeddingChunks(chunks: SearchIndexChunk[]): Promise<number> {
    if (chunks.length === 0) {
      return 0;
    }

    const columns = await this.getTableColumns("embedding_chunks");

    if (!columns.has("reel_id") || !columns.has("chunk_text")) {
      this.logger.warn("embedding_chunks exists but does not expose the expected reel_id/chunk_text columns.");
      return 0;
    }

    let inserted = 0;

    for (const chunk of chunks) {
      const insertColumns = ["reel_id", "chunk_text"];
      const values: Array<string | number> = [chunk.reelId, chunk.chunkText];

      if (columns.has("chunk_index")) {
        insertColumns.push("chunk_index");
        values.push(chunk.chunkIndex);
      }

      if (columns.has("source")) {
        insertColumns.push("source");
        values.push(chunk.source);
      }

      const placeholders = values.map((_, index) => `$${index + 1}`).join(", ");

      try {
        await this.pool.query(
          `INSERT INTO embedding_chunks (${insertColumns.join(", ")}) VALUES (${placeholders})`,
          values,
        );
        inserted += 1;
      } catch (error) {
        this.logger.warn({ err: error, reelId: chunk.reelId }, "Skipping embedding_chunks insert due to schema mismatch.");
        return inserted;
      }
    }

    return inserted;
  }

  private async tryClaim(row: CandidateRow): Promise<ClaimedReelLease | null> {
    const client = await this.pool.connect();

    try {
      const lock = await client.query<BoolRow>("SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS locked", [row.id]);

      if (!lock.rows[0]?.locked) {
        client.release();
        return null;
      }

      const fresh = await client.query<CandidateRow & { status: string }>(
        `
          SELECT id, url, created_at, status
          FROM reels
          WHERE id = $1
        `,
        [row.id],
      );

      const current = fresh.rows[0];

      if (!current || current.status !== "processing") {
        await this.unlockAndRelease(client, row.id);
        return null;
      }

      return this.createLease(client, {
        id: current.id,
        url: current.url,
        createdAt: current.created_at.toISOString(),
      });
    } catch (error) {
      client.release();
      throw error;
    }
  }

  private createLease(client: PoolClient, job: ClaimedReelJob): ClaimedReelLease {
    let released = false;

    const release = async () => {
      if (released) {
        return;
      }

      released = true;
      await this.unlockAndRelease(client, job.id);
    };

    return {
      job,
      markComplete: async ({ transcript, description, extractedJson, hasExtractedJsonColumn }) => {
        const params: unknown[] = [job.id, transcript, description];
        const extractedClause = hasExtractedJsonColumn ? ", extracted_json = $4::jsonb" : "";

        if (hasExtractedJsonColumn) {
          params.push(JSON.stringify(extractedJson));
        }

        await client.query(
          `
            UPDATE reels
            SET
              transcript = $2,
              description = $3,
              status = 'complete',
              error_message = NULL
              ${extractedClause}
            WHERE id = $1
          `,
          params,
        );
      },
      markError: async (error) => {
        await client.query(
          `
            UPDATE reels
            SET
              status = 'error',
              error_message = $2
            WHERE id = $1
          `,
          [job.id, formatErrorMessage(error)],
        );
      },
      release,
    };
  }

  private async unlockAndRelease(client: PoolClient, id: string): Promise<void> {
    try {
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1, 0))", [id]);
    } finally {
      client.release();
    }
  }

  private async assertTableExists(tableName: string): Promise<void> {
    if (!(await this.hasTable(tableName))) {
      throw new PipelineError({
        code: "TABLE_NOT_FOUND",
        stage: "database-claim",
        retryable: false,
        message: `Required table does not exist: ${tableName}`,
      });
    }
  }

  private async hasTable(tableName: string): Promise<boolean> {
    const result = await this.pool.query<{ regclass: string | null }>("SELECT to_regclass($1) AS regclass", [tableName]);
    return Boolean(result.rows[0]?.regclass);
  }

  private async getTableColumns(tableName: string): Promise<Set<string>> {
    const result = await this.pool.query<{ column_name: string }>(
      `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = $1
      `,
      [tableName],
    );

    return new Set(result.rows.map((row) => row.column_name));
  }
}
