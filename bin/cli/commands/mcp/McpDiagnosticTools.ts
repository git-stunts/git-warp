import { z } from 'zod';

import type Runtime from '../../../../src/application/Runtime.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { toMcpJson } from '../../../presenters/V19Json.ts';
import { closeCliStorages } from '../../shared.ts';
import prepareMaterialization from '../MaterializationRepair.ts';
import handleSubstrateDoctor from '../doctor/index.ts';
import handleSubstrateAudit from '../verify-audit.ts';
import type { McpDomainTool } from './McpDomainTool.ts';
import type { McpJsonObject, McpJsonValue } from './McpJsonValue.ts';
import type McpRuntimeSession from './McpRuntimeSession.ts';
import { parseMcpToolInput } from './McpToolInput.ts';

const LANE_SCHEMA = z.object({
  lane: z.string().min(1),
}).strict();

const REPAIR_SCHEMA = z.object({
  lane: z.string().min(1),
  action: z.literal('materialization'),
}).strict();

const AUDIT_SCHEMA = z.object({
  lane: z.string().min(1),
  writer: z.string().min(1).optional(),
}).strict();

export const MCP_DIAGNOSTIC_TOOLS: ReadonlyMap<string, McpDomainTool> =
  new Map([
    ['warp_doctor', doctor],
    ['warp_repair', repair],
    ['warp_audit', audit],
  ]);

async function doctor(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { lane } = parseMcpToolInput(LANE_SCHEMA, args);
  await runtime.lane(lane);
  return await runSubstrateDiagnostic(async () => {
    const result = await handleSubstrateDoctor({
      options: session.cliOptions(lane),
    });
    return toMcpJson(result.payload);
  });
}

async function repair(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { lane } = parseMcpToolInput(REPAIR_SCHEMA, args);
  await runtime.lane(lane);
  return await runSubstrateDiagnostic(async () =>
    toMcpJson(await prepareMaterialization(session.cliOptions(lane), lane)),
  );
}

async function audit(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(AUDIT_SCHEMA, args);
  await runtime.lane(input.lane);
  return await runSubstrateDiagnostic(async () => {
    const result = await handleSubstrateAudit({
      options: session.cliOptions(input.lane),
      args:
        input.writer === undefined
          ? []
          : ['--writer', input.writer],
    });
    return toMcpJson(requireObject(result.payload));
  });
}

async function runSubstrateDiagnostic(
  task: () => Promise<McpJsonValue>,
): Promise<McpJsonValue> {
  try {
    return await task();
  } finally {
    await closeCliStorages();
  }
}

function requireObject(value: unknown): object {
  if (value === null || typeof value !== 'object') {
    throw new WarpError(
      'Diagnostic result must be an object',
      'E_MCP_DIAGNOSTIC_RESULT',
    );
  }
  return value;
}
