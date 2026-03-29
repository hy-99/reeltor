process.env.ENABLE_MOCK_FETCH = process.env.ENABLE_MOCK_FETCH ?? "true";

import { readFile } from "node:fs/promises";
import path from "node:path";

const [{ env }, { processReelJob }, { createLogger }] = await Promise.all([
  import("../src/config/env.js"),
  import("../src/services/process-reel.js"),
  import("../src/utils/logger.js"),
]);

const logger = createLogger({ mode: "single-test" });

async function loadFixture(): Promise<{ id: string; url: string }> {
  const overrideUrl = process.argv[2];

  if (overrideUrl) {
    return {
      id: "local-cli-test",
      url: overrideUrl,
    };
  }

  const fixturePath = path.resolve(env.LOCAL_TEST_FIXTURE);
  const raw = await readFile(fixturePath, "utf8");
  return JSON.parse(raw) as { id: string; url: string };
}

async function main(): Promise<void> {
  const fixture = await loadFixture();
  const result = await processReelJob({
    job: {
      id: fixture.id,
      url: fixture.url,
      createdAt: new Date().toISOString(),
    },
    logger,
  });

  process.stdout.write(`${JSON.stringify(result.extracted, null, 2)}\n`);
}

main().catch((error) => {
  logger.error({ err: error }, "Single reel test failed.");
  process.exitCode = 1;
});
