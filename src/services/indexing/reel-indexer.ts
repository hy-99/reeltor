import type { Logger } from "pino";

import type { ExtractedReelJson, SchemaCapabilities, SearchIndexChunk } from "../../types/pipeline.js";
import { ReelsRepository } from "../../db/reels-repository.js";

function splitIntoChunks(input: { reelId: string; text: string; source: SearchIndexChunk["source"] }): SearchIndexChunk[] {
  const normalized = input.text.replace(/\s+/g, " ").trim();

  if (!normalized) {
    return [];
  }

  const words = normalized.split(" ");
  const chunks: SearchIndexChunk[] = [];
  const chunkSize = 90;
  const overlap = 15;
  let start = 0;
  let chunkIndex = 0;

  while (start < words.length) {
    const slice = words.slice(start, start + chunkSize).join(" ").trim();

    if (slice) {
      chunks.push({
        reelId: input.reelId,
        chunkIndex,
        chunkText: slice,
        source: input.source,
      });
    }

    if (start + chunkSize >= words.length) {
      break;
    }

    start += chunkSize - overlap;
    chunkIndex += 1;
  }

  return chunks;
}

export async function indexReelForSearch(input: {
  repository: ReelsRepository;
  capabilities: SchemaCapabilities;
  logger: Logger;
  reelId: string;
  transcript: string;
  description: string;
  extracted: ExtractedReelJson;
}): Promise<void> {
  const { capabilities, logger } = input;

  if (!capabilities.hasEmbeddingChunks) {
    logger.debug({ stage: "indexing" }, "embedding_chunks table not found. Skipping search chunk persistence.");
    return;
  }

  const chunks = [
    ...splitIntoChunks({ reelId: input.reelId, text: input.transcript, source: "transcript" }),
    ...splitIntoChunks({ reelId: input.reelId, text: input.description, source: "description" }),
    ...splitIntoChunks({ reelId: input.reelId, text: input.extracted.summary, source: "summary" }),
    ...splitIntoChunks({ reelId: input.reelId, text: input.extracted.ocr_text.join(" "), source: "ocr" }),
  ];

  const inserted = await input.repository.insertEmbeddingChunks(chunks);
  logger.info({ stage: "indexing", reelId: input.reelId, inserted }, "Inserted search chunks for reel.");

  if (capabilities.hasVecEmbeddings) {
    logger.warn(
      { stage: "indexing", reelId: input.reelId },
      "vec_embeddings table detected, but writeback is skipped until its exact column contract is confirmed.",
    );
  }
}
