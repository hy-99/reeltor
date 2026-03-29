import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { env } from "../config/env.js";

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function createWorkingDirectory(prefix: string): Promise<string> {
  const baseDir = path.resolve(env.REELTOR_TMP_DIR || tmpdir());
  await ensureDirectory(baseDir);
  return mkdtemp(path.join(baseDir, `${prefix}-`));
}

export async function cleanupWorkingDirectory(dirPath: string): Promise<void> {
  if (env.REELTOR_DEBUG_KEEP_TEMP) {
    return;
  }

  await rm(dirPath, { recursive: true, force: true });
}

export async function fileToDataUrl(filePath: string, mimeType: string): Promise<string> {
  const data = await readFile(filePath);
  return `data:${mimeType};base64,${data.toString("base64")}`;
}
