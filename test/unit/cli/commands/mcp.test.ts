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
import { Runtime } from '../../../../index.ts';
import Intent from '../../../../src/domain/api/Intent.ts';

const EXPECTED_TOOLS = [
  'warp_lane_describe',
  'warp_intent_write',
  'warp_observation_start',
  'warp_observation_read',
  'warp_observation_cancel',
  'warp_receipt_get',
  'warp_settlement_preview',
  'warp_settlement_apply',
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
          name: 'warp_lane_describe',
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

  it('keeps observation cursors as transport details', () => {
    const receiptRef = session.retainReceipt({
      type: 'Receipt',
      operation: 'observe',
    });
    const observationId = session.retainObservation(
      [
        { type: 'Reading', value: 'first' },
        { type: 'Reading', value: 'second' },
      ],
      receiptRef,
    );

    expect(session.readObservation(observationId, undefined, 1))
      .toEqual({
        observationId,
        readings: [{ type: 'Reading', value: 'first' }],
        cursor: '1',
        terminal: false,
        receiptRef: null,
      });
    expect(session.readObservation(observationId, '1', 1))
      .toEqual({
        observationId,
        readings: [{ type: 'Reading', value: 'second' }],
        cursor: null,
        terminal: true,
        receiptRef,
      });
  });

  it('re-previews and applies a retained plan across Runtime calls', async () => {
    await seedSettlement(repository);

    const preview = await callTool(1, 'warp_settlement_preview', {
      sourceLane: 'users',
      sourceStrand: 'review',
      targetLane: 'users',
    });
    expect(preview).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: {
        structuredContent: {
          type: 'SettlementPreview',
          planRef: 'plan-1',
          outcome: { kind: 'derived' },
        },
      },
    });

    const applied = await callTool(2, 'warp_settlement_apply', {
      planRef: 'plan-1',
    });
    expect(applied).toMatchObject({
      jsonrpc: '2.0',
      id: 2,
      result: {
        structuredContent: {
          receiptRef: 'receipt-1',
          receipt: {
            type: 'Receipt',
            operation: 'settle',
            outcome: { kind: 'derived' },
          },
        },
      },
    });

    const observation = await callTool(3, 'warp_observation_start', {
      lane: 'users',
      observerId: 'users.role',
      reading: {
        kind: 'property.get',
        subject: 'user:alice',
        key: 'role',
      },
    });
    expect(observation).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      result: {
        structuredContent: { observationId: 'observation-1' },
      },
    });
    expect(await callTool(4, 'warp_observation_read', {
      observationId: 'observation-1',
    })).toMatchObject({
      jsonrpc: '2.0',
      id: 4,
      result: {
        structuredContent: {
          readings: [{ type: 'Reading', value: 'admin' }],
          terminal: true,
        },
      },
    });
  });

  it('rejects a retained plan when the target changed after preview', async () => {
    await seedSettlement(repository);
    await callTool(1, 'warp_settlement_preview', {
      sourceLane: 'users',
      sourceStrand: 'review',
      targetLane: 'users',
    });
    await callTool(2, 'warp_intent_write', {
      lane: 'users',
      intent: {
        kind: 'property.set',
        subject: 'user:alice',
        key: 'role',
        value: 'owner',
      },
    });

    expect(await callTool(3, 'warp_settlement_apply', {
      planRef: 'plan-1',
    })).toMatchObject({
      jsonrpc: '2.0',
      id: 3,
      error: {
        code: -32000,
        message: 'Reviewed Settlement plan no longer matches the current Runtime preview',
      },
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

async function seedSettlement(repository: string): Promise<void> {
  const runtime = await Runtime.open({
    at: repository,
    writer: 'mcp-test',
  });
  try {
    const users = await runtime.lane('users');
    await users.write(Intent.addNode({ subject: 'user:alice' }));
    const review = await runtime.fork(users, { name: 'review' });
    await review.write(Intent.setProperty({
      subject: 'user:alice',
      key: 'role',
      value: 'admin',
    }));
  } finally {
    await runtime.close();
  }
}
