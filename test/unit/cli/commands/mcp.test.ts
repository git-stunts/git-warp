import { describe, expect, it } from 'vitest';

import {
  handleMcpMessage,
  listMcpTools,
  type McpGraphReadSurface,
} from '../../../../bin/cli/commands/mcp/McpProtocol.ts';

class McpReadGraph implements McpGraphReadSurface {
  readonly graphName = 'events';
  readonly writerId = 'mcp-test';

  hasNode(nodeId: string): Promise<boolean> {
    return Promise.resolve(nodeId === 'task:a');
  }

  getNodes(): Promise<string[]> {
    return Promise.resolve(['task:a', 'task:b']);
  }

  getNodeProps(nodeId: string): Promise<{ readonly [key: string]: string } | null> {
    if (nodeId === 'task:a') {
      return Promise.resolve({ status: 'open' });
    }
    return Promise.resolve(null);
  }

  getEdges(): Promise<Array<{
    readonly from: string;
    readonly to: string;
    readonly label: string;
    readonly props: { readonly [key: string]: string };
  }>> {
    return Promise.resolve([
      { from: 'task:a', to: 'task:b', label: 'blocks', props: { status: 'active' } },
    ]);
  }
}

describe('MCP command protocol', () => {
  it('advertises a narrow read-only tool catalog', () => {
    expect(listMcpTools().map((tool) => tool.name)).toEqual([
      'warp_info',
      'warp_nodes',
      'warp_node_props',
      'warp_edges',
      'warp_has_node',
    ]);
  });

  it('responds to initialize with tool capability metadata', async () => {
    const response = await handleMcpMessage(new McpReadGraph(), {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-06-18' },
    }, { serverVersion: '18.0.0' });

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'git-warp',
          version: '18.0.0',
        },
      },
    });
  });

  it('returns structured tool output without CLI text parsing', async () => {
    const response = await handleMcpMessage(new McpReadGraph(), {
      jsonrpc: '2.0',
      id: 'props',
      method: 'tools/call',
      params: {
        name: 'warp_node_props',
        arguments: { nodeId: 'task:a' },
      },
    }, { serverVersion: '18.0.0' });

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'props',
      result: {
        content: [
          { type: 'text', text: '{"nodeId":"task:a","props":{"status":"open"}}' },
        ],
        structuredContent: {
          nodeId: 'task:a',
          props: { status: 'open' },
        },
      },
    });
  });

  it('rejects invalid tool input at the MCP boundary', async () => {
    const response = await handleMcpMessage(new McpReadGraph(), {
      jsonrpc: '2.0',
      id: 'invalid',
      method: 'tools/call',
      params: {
        name: 'warp_node_props',
        arguments: {},
      },
    }, { serverVersion: '18.0.0' });

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 'invalid',
      error: {
        code: -32602,
        message: 'Invalid MCP tool input',
      },
    });
  });
});
