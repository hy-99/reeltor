export type ReelStatus = "processing" | "complete" | "error";

export type SupportedPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "direct"
  | "mock";

export type PipelineStage =
  | "database-claim"
  | "url-normalize"
  | "fetch"
  | "media-verify"
  | "media-preprocess"
  | "transcribe"
  | "ocr"
  | "vision"
  | "output"
  | "database-write"
  | "indexing";

export interface ReelRow {
  id: string;
  url: string;
  transcript: string | null;
  description: string | null;
  collection: string | null;
  status: ReelStatus;
  errorMessage: string | null;
  createdAt: string;
}

export interface ClaimedReelJob {
  id: string;
  url: string;
  createdAt: string;
}

export interface NormalizedReelUrl {
  originalUrl: string;
  canonicalUrl: string;
  platform: SupportedPlatform;
  normalizedChanged: boolean;
}

export interface FetchMetadata {
  caption?: string;
  creator?: string;
  postId?: string;
  postedAt?: string;
  thumbnailUrl?: string;
}

export interface FetchDiagnostics {
  provider: "mock" | "direct" | "yt-dlp";
  notes: string[];
}

export interface FetchResult {
  mediaPath: string;
  metadata: FetchMetadata;
  diagnostics: FetchDiagnostics;
}

export interface MediaProbe {
  durationSeconds: number;
  hasAudio: boolean;
  width: number;
  height: number;
  format: string;
  videoCodec: string;
  audioCodec: string;
}

export interface FrameArtifact {
  timeSeconds: number;
  path: string;
}

export interface PreparedMedia {
  normalizedVideoPath: string;
  audioPath: string | null;
  frames: FrameArtifact[];
  probe: MediaProbe;
}

export interface TranscriptSegment {
  startSeconds: number;
  endSeconds: number;
  text: string;
}

export interface TranscriptResult {
  fullText: string;
  segments: TranscriptSegment[];
  language: string;
}

export interface OcrItem {
  timeSeconds: number;
  text: string;
}

export interface OcrResult {
  items: OcrItem[];
}

export interface VisionEntities {
  people: string[];
  products: string[];
  brands: string[];
  objects: string[];
  places: string[];
}

export interface VisionResult {
  summary: string;
  contentType: string;
  entities: VisionEntities;
  actions: string[];
  sceneNotes: string[];
}

export interface ExtractedReelJson {
  summary: string;
  content_type: string;
  transcript: string;
  ocr_text: string[];
  entities: VisionEntities;
  actions: string[];
  key_facts: string[];
  recommended_tags: string[];
  source: {
    reel_id: string;
    url: string;
    canonical_url: string;
    platform: SupportedPlatform;
  };
  metadata: {
    caption: string;
    creator: string;
    post_id: string;
    posted_at: string;
    thumbnail_url: string;
  };
  media: {
    duration_seconds: number;
    has_audio: boolean;
    width: number;
    height: number;
    format: string;
    video_codec: string;
    audio_codec: string;
  };
  diagnostics: {
    fetch_provider: string;
    fetch_notes: string[];
    normalized_url_changed: boolean;
  };
}

export interface SearchIndexChunk {
  reelId: string;
  chunkIndex: number;
  chunkText: string;
  source: "transcript" | "description" | "summary" | "ocr";
}

export interface SchemaCapabilities {
  hasExtractedJson: boolean;
  hasEmbeddingChunks: boolean;
  hasVecEmbeddings: boolean;
}
