import type Runtime from '../../../../src/application/Runtime.ts';
import type { McpJsonObject, McpJsonValue } from './McpJsonValue.ts';
import type McpRuntimeSession from './McpRuntimeSession.ts';

export type McpDomainTool = (
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
) => Promise<McpJsonValue>;
