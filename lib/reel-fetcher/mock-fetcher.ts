import path from "node:path";

import type { FetchOutcome, NormalizedReelUrl } from "../../types/pipeline.js";
import { runFfmpeg } from "../media/ffmpeg.js";

export async function fetchMockReel(input: {
  normalized: NormalizedReelUrl;
  workingDirectory: string;
}): Promise<FetchOutcome> {
  const mediaPath = path.join(input.workingDirectory, "mock-source.mp4");

  await runFfmpeg(
    [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "color=c=0x1b4965:s=720x1280:d=6",
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
    success: true,
    mediaAccessible: true,
    mediaPath,
    metadata: {
      caption: "Mock reel for local end-to-end pipeline testing.",
      creator: "reeltor-local-fixture",
      postId: "mock-local-test",
      postedAt: new Date().toISOString(),
      thumbnailUrl: "",
    },
  };
}
