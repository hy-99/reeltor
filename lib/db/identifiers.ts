import { PipelineError } from "../utils/errors.js";

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function splitQualifiedName(input: string): { schema: string; table: string } {
  const parts = input.split(".");

  if (parts.length === 1) {
    return { schema: "public", table: parts[0] };
  }

  if (parts.length === 2) {
    return { schema: parts[0], table: parts[1] };
  }

  throw new PipelineError({
    code: "INVALID_IDENTIFIER",
    stage: "database-read",
    retryable: false,
    message: `Invalid qualified identifier: ${input}`,
  });
}

export function quoteIdentifier(input: string): string {
  if (!IDENTIFIER_PATTERN.test(input)) {
    throw new PipelineError({
      code: "INVALID_IDENTIFIER",
      stage: "database-read",
      retryable: false,
      message: `Invalid SQL identifier: ${input}`,
    });
  }

  return `"${input}"`;
}

export function quoteQualifiedName(input: string): string {
  const { schema, table } = splitQualifiedName(input);
  return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}
