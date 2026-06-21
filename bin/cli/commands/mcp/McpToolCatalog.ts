import { z } from 'zod';

import { compactStringify } from '../../../presenters/json.ts';
import ImmutableBytes from '../../../../src/domain/services/snapshot/ImmutableBytes.ts';
import McpProtocolError from './McpProtocolError.ts';
import type {
  QueryPropertyBag,
  VisibleEdge,
} from '../../../../src/domain/capabilities/QueryCapability.ts';
import type { SnapshotPropValue } from '../../../../src/domain/services/snapshot/SnapshotPropValue.ts';
import type { McpJsonObject, McpJsonValue } from './McpJsonValue.ts';

export type McpGraphReadSurface = {
  readonly graphName: string;
  readonly writerId: string;
  hasNode(nodeId: string): Promise<boolean>;
  getNodes(): Promise<string[]>;
  getNodeProps(nodeId: string): Promise<QueryPropertyBag | null>;
  getEdges(): Promise<readonly VisibleEdge[]>;
};

export type McpToolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: McpJsonObject;
};

type RegisteredMcpTool = McpToolDescriptor & {
  readonly handle: (graph: McpGraphReadSurface, args: McpJsonObject) => Promise<McpJsonValue>;
};

const EMPTY_ARGS_SCHEMA = z.object({}).strict();
const NODE_ID_ARGS_SCHEMA = z.object({ nodeId: z.string().min(1) }).strict();

const EMPTY_INPUT_SCHEMA: McpJsonObject = Object.freeze({
  type: 'object',
  properties: Object.freeze({}),
  additionalProperties: false,
});

const NODE_ID_INPUT_SCHEMA: McpJsonObject = Object.freeze({
  type: 'object',
  properties: Object.freeze({
    nodeId: Object.freeze({ type: 'string', minLength: 1 }),
  }),
  required: Object.freeze(['nodeId']),
  additionalProperties: false,
});

const REGISTERED_TOOLS: readonly RegisteredMcpTool[] = Object.freeze([
  Object.freeze({
    name: 'warp_info',
    description: 'Return graph identity and MCP server posture.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    handle: warpInfo,
  }),
  Object.freeze({
    name: 'warp_nodes',
    description: 'List visible node ids for the opened graph.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    handle: warpNodes,
  }),
  Object.freeze({
    name: 'warp_node_props',
    description: 'Read visible properties for a single node id.',
    inputSchema: NODE_ID_INPUT_SCHEMA,
    handle: warpNodeProps,
  }),
  Object.freeze({
    name: 'warp_edges',
    description: 'List visible edges for the opened graph.',
    inputSchema: EMPTY_INPUT_SCHEMA,
    handle: warpEdges,
  }),
  Object.freeze({
    name: 'warp_has_node',
    description: 'Return whether a visible node id exists.',
    inputSchema: NODE_ID_INPUT_SCHEMA,
    handle: warpHasNode,
  }),
]);

const TOOLS_BY_NAME = new Map(REGISTERED_TOOLS.map((tool) => [tool.name, tool]));

export function listMcpTools(): readonly McpToolDescriptor[] {
  return Object.freeze(REGISTERED_TOOLS.map((tool) => Object.freeze({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  })));
}

export async function callMcpTool(
  graph: McpGraphReadSurface,
  name: string,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const tool = TOOLS_BY_NAME.get(name);
  if (tool === undefined) {
    throw new McpProtocolError(-32602, `Unknown MCP tool: ${name}`);
  }
  return toolResponse(await tool.handle(graph, args));
}

function warpInfo(graph: McpGraphReadSurface, args: McpJsonObject): Promise<McpJsonValue> {
  parseEmptyArgs(args);
  return Promise.resolve({
    graph: graph.graphName,
    writer: graph.writerId,
    posture: 'read-only',
  });
}

async function warpNodes(graph: McpGraphReadSurface, args: McpJsonObject): Promise<McpJsonValue> {
  parseEmptyArgs(args);
  return { nodes: await graph.getNodes() };
}

async function warpNodeProps(graph: McpGraphReadSurface, args: McpJsonObject): Promise<McpJsonValue> {
  const { nodeId } = parseNodeIdArgs(args);
  const props = await graph.getNodeProps(nodeId);
  return {
    nodeId,
    props: props === null ? null : propertyBagToJson(props),
  };
}

async function warpEdges(graph: McpGraphReadSurface, args: McpJsonObject): Promise<McpJsonValue> {
  parseEmptyArgs(args);
  return { edges: (await graph.getEdges()).map(edgeToJson) };
}

async function warpHasNode(graph: McpGraphReadSurface, args: McpJsonObject): Promise<McpJsonValue> {
  const { nodeId } = parseNodeIdArgs(args);
  return { nodeId, exists: await graph.hasNode(nodeId) };
}

function parseEmptyArgs(args: McpJsonObject): void {
  const parsed = EMPTY_ARGS_SCHEMA.safeParse(args);
  if (!parsed.success) {
    throw invalidToolInput(parsed.error.issues.map((issue) => issue.message));
  }
}

function parseNodeIdArgs(args: McpJsonObject): { readonly nodeId: string } {
  const parsed = NODE_ID_ARGS_SCHEMA.safeParse(args);
  if (parsed.success) {
    return parsed.data;
  }
  throw invalidToolInput(parsed.error.issues.map((issue) => issue.message));
}

function invalidToolInput(issues: readonly string[]): McpProtocolError {
  return new McpProtocolError(-32602, 'Invalid MCP tool input', { issues });
}

function edgeToJson(edge: VisibleEdge): McpJsonValue {
  return {
    from: edge.from,
    to: edge.to,
    label: edge.label,
    props: propertyBagToJson(edge.props),
  };
}

function propertyBagToJson(props: QueryPropertyBag): McpJsonValue {
  const bag: { [key: string]: McpJsonValue } = {};
  for (const [key, value] of Object.entries(props)) {
    bag[key] = propValueToJson(value);
  }
  return Object.freeze(bag);
}

function propValueToJson(value: SnapshotPropValue): McpJsonValue {
  if (value instanceof ImmutableBytes) {
    return { type: 'bytes', value: value.toArray() };
  }
  if (isSnapshotPropArray(value)) {
    return Object.freeze(value.map(propValueToJson));
  }
  if (value !== null && typeof value === 'object') {
    return propObjectToJson(value);
  }
  return value;
}

function isSnapshotPropArray(value: SnapshotPropValue): value is readonly SnapshotPropValue[] {
  return Array.isArray(value);
}

function propObjectToJson(value: { readonly [key: string]: SnapshotPropValue }): McpJsonValue {
  const objectValue: { [key: string]: McpJsonValue } = {};
  for (const [key, entry] of Object.entries(value)) {
    objectValue[key] = propValueToJson(entry);
  }
  return Object.freeze(objectValue);
}

function toolResponse(payload: McpJsonValue): McpJsonValue {
  return {
    content: [{ type: 'text', text: compactStringify(payload) }],
    structuredContent: payload,
  };
}
