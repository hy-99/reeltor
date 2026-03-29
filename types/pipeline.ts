export type ProcessingStatus = "pending" | "processing" | "completed" | "failed";

export type SupportedPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "direct"
  | "mock";

export type PipelineStage =
  | "database-read"
  | "url-validation"
  | "fetch"
  | "media-verification"
  | "preprocessing"
  | "transcription"
  | "ocr"
  | "vision"
  | "database-writeback";

export interface SourceRecord {
  id: string;
  reelUrl: string;
}

export interface ClaimedReelJob extends SourceRecord {
  status: ProcessingStatus;
  retryCount: number;
  lastAttemptAt: string | null;
}

export interface NormalizedReelUrl {
  originalUrl: string;
  canonicalUrl: string;
  platform: SupportedPlatform;
  normalizedChanged: boolean;
}

export interface ReelMetadata {
  caption: string;
  creator: string;
  postId: string;
  postedAt: string;
  thumbnailUrl: string;
}

export interface FetchOutcome {
  success: true;
  mediaAccessible: true;
  mediaPath: string;
  metadata: ReelMetadata;
}

export interface MediaInfo {
  durationSeconds: number;
  hasAudio: boolean;
  width: number;
  height: number;
  format: string;
  videoCodec: string;
  audioCodec: string;
}

export interface FrameArtifact {
  time: number;
  path: string;
}

export interface PreprocessedMedia {
  normalizedVideoPath: string;
  audioPath: string | null;
  frames: FrameArtifact[];
}

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  fullText: string;
  segments: TranscriptSegment[];
  language: string;
}

export interface OcrTextItem {
  time: number;
  text: string;
}

export interface OcrResult {
  texts: OcrTextItem[];
}

export interface VisionScene {
  time: number;
  description: string;
}

export interface VisionEntities {
  people: string[];
  products: string[];
  brands: string[];
  objects: string[];
  places: string[];
}

export interface VisionResult {
  contentType: string;
  summary: string;
  entities: VisionEntities;
  actions: string[];
  scenes: VisionScene[];
}

export interface AgentReadyResult {
  summary: string;
  keyFacts: string[];
  recommendedTags: string[];
  actionableItems: string[];
}

export interface ReelStructuredOutput {
  source: {
    record_id: string;
    platform: SupportedPlatform;
    reel_url: string;
    canonical_url: string;
  };
  fetch: {
    success: boolean;
    media_accessible: boolean;
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
  metadata: {
    caption: string;
    creator: string;
    post_id: string;
    posted_at: string;
    thumbnail_url: string;
  };
  transcript: {
    full_text: string;
    segments: Array<{
      start: number;
      end: number;
      text: string;
    }>;
    language: string;
  };
  ocr: {
    texts: Array<{
      time: number;
      text: string;
    }>;
  };
  vision: {
    content_type: string;
    summary: string;
    entities: {
      people: string[];
      products: string[];
      brands: string[];
      objects: string[];
      places: string[];
    };
    actions: string[];
    scenes: Array<{
      time: number;
      description: string;
    }>;
  };
  agent_ready: {
    summary: string;
    key_facts: string[];
    recommended_tags: string[];
    actionable_items: string[];
  };
}

export interface PersistedFailure {
  stage: PipelineStage;
  code: string;
  retryable: boolean;
  message: string;
  details?: Record<string, unknown>;
}
