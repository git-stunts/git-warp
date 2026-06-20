import {
  callMcpTool,
  listMcpTools,
  type McpGraphReadSurface,
} from './McpToolCatalog.ts';
import McpProtocolError from './McpProtocolError.ts';
import {
  isMcpJsonObject,
  type McpJsonObject,
  type McpJsonValue,
} from './McpJsonValue.ts';

export {
  listMcpTools,
  type McpGraphReadSurface,
} from './McpToolCatalog.ts';

type McpRequestId = string | number | null;

type McpRequest = {
  readonly jsonrpc: '2.0';
  readonly id?: McpRequestId;
  readonly method: string;
  readonly params?: McpJsonObject;
};

export type McpResponse =
  | {
      readonly jsonrpc: '2.0';
      readonly id: McpRequestId;
      readonly result: McpJsonValue;
    }
  | {
      readonly jsonrpc: '2.0';
      readonly id: McpRequestId;
      readonly error: {
        readonly code: number;
        readonly message: string;
        readonly data?: McpJsonValue;
      };
    };

type McpOptions = {
  readonly serverVersion: string;
};

type ToolCallInput = {
  readonly name: string;
  readonly arguments: McpJsonObject;
};

type MethodHandler = (
  graph: McpGraphReadSurface,
  request: McpRequest,
  options: McpOptions,
) => Promise<McpJsonValue>;

const METHOD_HANDLERS: ReadonlyMap<string, MethodHandler> = new Map<string, MethodHandler>([
  ['initialize', handleInitialize],
  ['tools/list', handleToolsList],
  ['tools/call', handleToolsCall],
  ['resources/list', handleResourcesList],
  ['ping', handlePing],
]);

export function mcpParseError(): McpResponse {
  return errorResponse(null, new McpProtocolError(-32700, 'Parse error'));
}

export async function handleMcpMessage(
  graph: McpGraphReadSurface,
  message: unknown,
  options: McpOptions,
): Promise<McpResponse | null> {
  const request = readRequest(message);
  if (request === null) {
    return errorResponse(null, new McpProtocolError(-32600, 'Invalid Request'));
  }
  if (request.id === undefined) {
    return null;
  }
  try {
    const result = await dispatchRequest(graph, request, options);
    return resultResponse(request.id, result);
  } catch (error) {
    return errorResponse(request.id, normalizeError(error));
  }
}

async function dispatchRequest(
  graph: McpGraphReadSurface,
  request: McpRequest,
  options: McpOptions,
): Promise<McpJsonValue> {
  const handler = METHOD_HANDLERS.get(request.method);
  if (handler !== undefined) {
    return await handler(graph, request, options);
  }
  throw new McpProtocolError(-32601, `Method not found: ${request.method}`);
}

function handleInitialize(
  _graph: McpGraphReadSurface,
  request: McpRequest,
  options: McpOptions,
): Promise<McpJsonValue> {
  return Promise.resolve({
    protocolVersion: readProtocolVersion(request.params) ?? '2025-06-18',
    capabilities: { tools: {} },
    serverInfo: {
      name: 'git-warp',
      version: options.serverVersion,
    },
  });
}

function handleToolsList(): Promise<McpJsonValue> {
  return Promise.resolve({ tools: listMcpTools() });
}

async function handleToolsCall(
  graph: McpGraphReadSurface,
  request: McpRequest,
): Promise<McpJsonValue> {
  const input = readToolCallInput(request.params);
  return await callMcpTool(graph, input.name, input.arguments);
}

function handleResourcesList(): Promise<McpJsonValue> {
  return Promise.resolve({ resources: [] });
}

function handlePing(): Promise<McpJsonValue> {
  return Promise.resolve({});
}

function readProtocolVersion(params: McpJsonObject | undefined): string | null {
  const value = params?.['protocolVersion'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function readToolCallInput(params: McpJsonObject | undefined): ToolCallInput {
  return {
    name: readToolName(params),
    arguments: readToolArguments(params),
  };
}

function readToolName(params: McpJsonObject | undefined): string {
  const name = params?.['name'];
  if (typeof name === 'string' && name.length > 0) {
    return name;
  }
  throw new McpProtocolError(-32602, 'tools/call requires a tool name');
}

function readToolArguments(params: McpJsonObject | undefined): McpJsonObject {
  const args = params?.['arguments'];
  if (args === undefined) {
    return {};
  }
  if (isMcpJsonObject(args)) {
    return args;
  }
  throw new McpProtocolError(-32602, 'tools/call arguments must be an object');
}

function readRequest(value: unknown): McpRequest | null {
  if (!isMcpJsonObject(value)) {
    return null;
  }
  if (!hasValidRequestHeader(value) || !hasValidRequestId(value) || !hasValidParams(value)) {
    return null;
  }
  return value as McpRequest;
}

function hasValidRequestHeader(value: McpJsonObject): boolean {
  return value['jsonrpc'] === '2.0' && typeof value['method'] === 'string';
}

function hasValidRequestId(value: McpJsonObject): boolean {
  return isRequestId(value['id']);
}

function hasValidParams(value: McpJsonObject): boolean {
  return value['params'] === undefined || isMcpJsonObject(value['params']);
}

function isRequestId(value: unknown): boolean {
  return value === undefined || value === null || typeof value === 'string' || typeof value === 'number';
}

function resultResponse(id: McpRequestId, result: McpJsonValue): McpResponse {
  return { jsonrpc: '2.0', id, result };
}

function errorResponse(id: McpRequestId, error: McpProtocolError): McpResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code: error.code,
      message: error.message,
      ...(error.data !== undefined ? { data: error.data } : {}),
    },
  };
}

function normalizeError(error: unknown): McpProtocolError {
  if (error instanceof McpProtocolError) {
    return error;
  }
  const message = error instanceof Error ? error.message : 'Internal MCP error';
  return new McpProtocolError(-32000, message);
}
