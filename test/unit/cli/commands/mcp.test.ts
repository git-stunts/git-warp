import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { intent } from '../../../../advanced.ts';
import {
  handleMcpMessage,
  listMcpTools,
} from '../../../../bin/cli/commands/mcp/McpProtocol.ts';
import McpRuntimeSession
  from '../../../../bin/cli/commands/mcp/McpRuntimeSession.ts';
import {
  isMcpJsonObject,
  type McpJsonObject,
} from '../../../../bin/cli/commands/mcp/McpJsonValue.ts';
import { writeThroughWarp } from '../../../helpers/WarpSeed.ts';

const EXPECTED_TOOLS = [
  'warp_observation_start',
  'warp_observation_read',
  'warp_observation_cancel',
  'warp_receipt_get',
  'warp_doctor',
  'warp_repair',
  'warp_audit',
] as const;

describe('MCP command protocol', () => {
  let repository: string;
  let session: McpRuntimeSession;

  beforeEach(() => {
    repository = mkdtempSync(join(tmpdir(), 'git-warp-mcp-v19-'));
    execFileSync('git', ['init', '-q', repository]);
    session = new McpRuntimeSession({
      at: repository,
      writer: 'mcp-test',
    });
  });

  afterEach(async () => {
    await session.close();
    rmSync(repository, { recursive: true, force: true });
  });

  it('advertises only the generated v19 capability catalog', () => {
    expect(listMcpTools().map((tool) => tool.name)).toEqual(
      EXPECTED_TOOLS,
    );
  });

  it('responds to initialize with tool capability metadata', async () => {
    const response = await handleMcpMessage(
      session,
      {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-06-18' },
      },
      { serverVersion: '19.0.0' },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: {
          name: 'git-warp',
          version: '19.0.0',
        },
      },
    });
  });

  it.each([
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])('rejects non-finite numeric request IDs', async (id) => {
    const response = await handleMcpMessage(
      session,
      {
        jsonrpc: '2.0',
        id,
        method: 'ping',
      },
      { serverVersion: '19.0.0' },
    );

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Invalid Request',
      },
    });
  });

  it('rejects invalid tool input at the MCP boundary', async () => {
    const response = await handleMcpMessage(
      session,
      {
        jsonrpc: '2.0',
        id: 'invalid',
        method: 'tools/call',
        params: {
          name: 'warp_observation_start',
          arguments: {},
        },
      },
      { serverVersion: '19.0.0' },
    );

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 'invalid',
      error: {
        code: -32602,
        message: 'Invalid MCP tool input',
      },
    });
  });

  it.each([
    ['events', 'admin'],
    ['other', 'guest'],
  ])('observes the selected Lane %s through MCP tools', async (lane, role) => {
    await writeThroughWarp(repository, 'events', 'alice', [
      intent.node.add({ subject: 'user:alice' }),
      intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' }),
    ]);
    await writeThroughWarp(repository, 'other', 'alice', [
      intent.node.add({ subject: 'user:alice' }),
      intent.property.set({ subject: 'user:alice', key: 'role', value: 'guest' }),
    ]);
    await callTool(1, 'warp_repair', { lane: 'events', action: 'materialization' });
    await callTool(2, 'warp_repair', { lane: 'other', action: 'materialization' });

    const started = await callTool(3, 'warp_observation_start', {
      lane, observerId: 'role-reader',
      reading: { kind: 'property.get', subject: 'user:alice', key: 'role' },
    });
    const observationId = started['observationId'];
    if (typeof observationId !== 'string') throw new Error('MCP start requires an observation ID');
    const page = await callTool(4, 'warp_observation_read', { observationId });
    expect(page).toMatchObject({
      observationId, readings: [{ type: 'Reading', value: role }],
      terminal: true, cursor: null,
    });
    const receiptRef = page['receiptRef'];
    if (typeof receiptRef !== 'string') throw new Error('Completed MCP observation requires a receipt reference');
    const receipt = await callTool(5, 'warp_receipt_get', { receiptRef });
    expect(receipt).toMatchObject({
      type: 'Receipt', operation: 'observe', lane, writer: 'mcp-test',
      status: 'completed', observer: { id: 'role-reader' },
    });
  });

  it('keeps observation cursors over a lazy bounded transport', async () => {
    let pulls = 0;
    const retained = await session.retainObservation({
      readings: (async function* () {
        pulls += 1;
        yield { type: 'Reading', value: 'first' };
        pulls += 1;
        yield { type: 'Reading', value: 'second' };
      })(),
      receipt: () => Promise.resolve({
        type: 'Receipt',
        operation: 'observe',
      }),
    });
    const { observationId } = retained;
    expect(retained).toEqual({
      observationId,
      terminal: false,
      receiptRef: null,
    });
    expect(pulls).toBe(0);

    expect(await session.readObservation(observationId, undefined, 1))
      .toEqual({
        observationId,
        readings: [{ type: 'Reading', value: 'first' }],
        cursor: '1',
        terminal: false,
        receiptRef: null,
      });
    expect(pulls).toBe(2);
    expect(await session.readObservation(observationId, '1', 1))
      .toEqual({
        observationId,
        readings: [{ type: 'Reading', value: 'second' }],
        cursor: null,
        terminal: true,
        receiptRef: 'receipt-1',
      });
    expect(session.getReceipt('receipt-1')).toEqual({
      type: 'Receipt',
      operation: 'observe',
    });
  });

  async function callTool(
    id: number,
    name: string,
    args: McpJsonObject,
  ): Promise<McpJsonObject> {
    const response = await handleMcpMessage(
      session,
      {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      { serverVersion: '19.0.0' },
    );
    if (response === null || !('result' in response) || !isMcpJsonObject(response.result)) {
      throw new Error(`MCP ${name} requires a successful result`);
    }
    const content = response.result['structuredContent'];
    if (!isMcpJsonObject(content)) throw new Error(`MCP ${name} requires structured content`);
    return content;
  }
});
