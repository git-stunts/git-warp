import { compactStringify } from '../../../presenters/json.ts';
import { V19_CAPABILITY_CONTRACT } from '../../capabilities/V19CapabilityContract.generated.ts';
import {
  MCP_DOMAIN_TOOLS,
} from './McpDomainTools.ts';
import type { McpDomainTool } from './McpDomainTool.ts';
import type {
  McpJsonObject,
  McpJsonValue,
} from './McpJsonValue.ts';
import McpProtocolError from './McpProtocolError.ts';
import type McpRuntimeSession from './McpRuntimeSession.ts';

export type McpToolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpJsonObject;
};

export function listMcpTools(): readonly McpToolDescriptor[] {
  return Object.freeze(
    V19_CAPABILITY_CONTRACT.mcp.map((tool) =>
      Object.freeze({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }),
    ),
  );
}

export async function callMcpTool(
  session: McpRuntimeSession,
  name: string,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const handler = requireHandler(name);
  const payload = await session.run(
    async (runtime) => await handler(runtime, session, args),
  );
  return toolResponse(payload);
}

function requireHandler(name: string): McpDomainTool {
  const handler = MCP_DOMAIN_TOOLS.get(name);
  if (handler === undefined) {
    throw new McpProtocolError(
      -32602,
      `Unknown MCP tool: ${name}`,
    );
  }
  return handler;
}

function toolResponse(payload: McpJsonValue): McpJsonValue {
  return Object.freeze({
    content: Object.freeze([
      Object.freeze({
        type: 'text',
        text: compactStringify(payload),
      }),
    ]),
    structuredContent: payload,
  });
}
