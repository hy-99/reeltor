import { spawn } from "node:child_process";

import { PipelineError } from "./errors.js";
import type { PipelineStage } from "../../types/pipeline.js";

export async function runCommand(input: {
  command: string;
  args: string[];
  stage: PipelineStage;
  timeoutMs: number;
  cwd?: string;
}): Promise<{ stdout: string; stderr: string }> {
  const { command, args, stage, timeoutMs, cwd } = input;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new PipelineError({
          code: "COMMAND_TIMEOUT",
          stage,
          retryable: true,
          message: `Command timed out: ${command}`,
          details: { command, args, timeoutMs },
        }),
      );
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      reject(
        new PipelineError({
          code: "COMMAND_SPAWN_FAILED",
          stage,
          retryable: false,
          message: `Failed to spawn command: ${command}`,
          details: { command, args },
          cause: error,
        }),
      );
    });

    child.on("close", (code) => {
      clearTimeout(timer);

      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }

      reject(
        new PipelineError({
          code: "COMMAND_FAILED",
          stage,
          retryable: false,
          message: `Command exited with code ${code}: ${command}`,
          details: { command, args, code, stderr: stderr.trim().slice(0, 2_000) },
        }),
      );
    });
  });
}
