import path from "node:path";

import type { FetchResult } from "../../types/pipeline.js";
import { runFfmpeg } from "../media/ffmpeg.js";

export async function fetchMockReel(workingDirectory: string): Promise<FetchResult> {
  const mediaPath = path.join(workingDirectory, "mock-source.mp4");

  await runFfmpeg(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x264653:s=720x1280:d=6",
      "-f",
      "lavfi",
      "-i",
      "sine=frequency=880:duration=6",
      "-shortest",
      "-c:v",
      "libx264",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      mediaPath,
    ],
    "fetch",
  );

  return {
    mediaPath,
    metadata: {
      caption: "Mock reel for local pipeline verification.",
      creator: "reeltor-local",
      postId: "mock-local-test",
      postedAt: new Date().toISOString(),
      thumbnailUrl: "",
    },
    diagnostics: {
      provider: "mock",
      notes: ["Generated synthetic local reel artifact."],
    },
  };
}
