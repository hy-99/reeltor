import { spawn } from "node:child_process";

import { env } from "../config/env.js";
import { PipelineError } from "../types/errors.js";
import type { PipelineStage } from "../types/pipeline.js";

export async function runCommand(input: {
  command: string;
  args: string[];
  stage: PipelineStage;
  cwd?: string;
  timeoutMs?: number;
}): Promise<{ stdout: string; stderr: string }> {
  const timeoutMs = input.timeoutMs ?? env.REQUEST_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(input.command, input.args, {
      cwd: input.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new PipelineError({
          code: "COMMAND_TIMEOUT",
          stage: input.stage,
          retryable: true,
          message: `Command timed out: ${input.command}`,
          details: { args: input.args, timeoutMs },
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
          stage: input.stage,
          retryable: false,
          message: `Failed to spawn command: ${input.command}`,
          details: { args: input.args },
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
          stage: input.stage,
          retryable: false,
          message: `Command exited with code ${code}: ${input.command}`,
          details: {
            args: input.args,
            stderr: stderr.trim().slice(0, 2_000),
          },
        }),
      );
    });
  });
}
