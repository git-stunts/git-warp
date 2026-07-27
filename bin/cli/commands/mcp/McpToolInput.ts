import type { z } from 'zod';

import type { McpJsonObject } from './McpJsonValue.ts';
import McpProtocolError from './McpProtocolError.ts';

export function parseMcpToolInput<TOutput>(
  schema: z.ZodType<TOutput>,
  args: McpJsonObject,
): TOutput {
  const parsed = schema.safeParse(args);
  if (parsed.success) {
    return parsed.data;
  }
  throw new McpProtocolError(
    -32602,
    'Invalid MCP tool input',
    {
      issues: parsed.error.issues.map((issue) => issue.message),
    },
  );
}
