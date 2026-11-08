import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  handleMcpMessage,
  listMcpTools,
} from '../../../../bin/cli/commands/mcp/McpProtocol.ts';
import McpRuntimeSession
  from '../../../../bin/cli/commands/mcp/McpRuntimeSession.ts';

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
    args: Record<string, string | Record<string, string>>,
  ) {
    return await handleMcpMessage(
      session,
      {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args },
      },
      { serverVersion: '19.0.0' },
    );
  }
});
