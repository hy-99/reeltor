import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { env } from "../config/env.js";

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function createWorkingDirectory(prefix: string): Promise<string> {
  const basePath = path.resolve(env.TEMP_DIR || tmpdir());
  await ensureDirectory(basePath);
  return mkdtemp(path.join(basePath, `${prefix}-`));
}

export async function cleanupWorkingDirectory(dirPath: string): Promise<void> {
  if (env.DEBUG_KEEP_TEMP_FILES) {
    return;
  }

  await rm(dirPath, { recursive: true, force: true });
}

export async function imageFileToDataUrl(filePath: string): Promise<string> {
  const buffer = await readFile(filePath);
  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}
