import { z } from 'zod';

import type Runtime from '../../../../src/application/Runtime.ts';
import {
  JSON_INPUT_SCHEMA,
  observerFromValue,
} from '../../v19/V19DomainInput.ts';
import {
  readingEnvelope,
  receiptEnvelope,
} from '../../../presenters/V19ReadingReceipt.ts';
import type {
  McpJsonObject,
  McpJsonValue,
} from './McpJsonValue.ts';
import type McpRuntimeSession from './McpRuntimeSession.ts';
import type { McpDomainTool } from './McpDomainTool.ts';
import { MCP_DIAGNOSTIC_TOOLS } from './McpDiagnosticTools.ts';
import { parseMcpToolInput } from './McpToolInput.ts';

const OBSERVATION_START_SCHEMA = z.object({
  lane: z.string().min(1),
  observerId: z.string().min(1),
  reading: z.record(z.string(), JSON_INPUT_SCHEMA),
}).strict();

const OBSERVATION_READ_SCHEMA = z.object({
  observationId: z.string().min(1),
  cursor: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(256).default(64),
}).strict();

const OBSERVATION_ID_SCHEMA = z.object({
  observationId: z.string().min(1),
}).strict();

const RECEIPT_SCHEMA = z.object({
  receiptRef: z.string().min(1),
}).strict();

export const MCP_DOMAIN_TOOLS: ReadonlyMap<string, McpDomainTool> = new Map([
  ['warp_observation_start', startObservation],
  ['warp_observation_read', readObservation],
  ['warp_observation_cancel', cancelObservation],
  ['warp_receipt_get', getReceipt],
  ...MCP_DIAGNOSTIC_TOOLS,
]);

async function startObservation(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(OBSERVATION_START_SCHEMA, args);
  const lane = await runtime.lane(input.lane);
  const observation = lane.observe(
    observerFromValue(input.observerId, input.reading),
  );
  return session.retainObservation({
    readings: readingEnvelopes(observation),
    receipt: async () => receiptEnvelope(await observation.receipt),
  });
}

async function readObservation(
  _runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(OBSERVATION_READ_SCHEMA, args);
  return await session.readObservation(
    input.observationId,
    input.cursor,
    input.limit ?? 64,
  );
}

async function cancelObservation(
  _runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { observationId } = parseMcpToolInput(
    OBSERVATION_ID_SCHEMA,
    args,
  );
  return await session.cancelObservation(observationId);
}

async function* readingEnvelopes(
  readings: AsyncIterable<Parameters<typeof readingEnvelope>[0]>,
): AsyncIterable<McpJsonValue> {
  for await (const observed of readings) {
    yield readingEnvelope(observed);
  }
}

function getReceipt(
  _runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { receiptRef } = parseMcpToolInput(RECEIPT_SCHEMA, args);
  return Promise.resolve(session.getReceipt(receiptRef));
}
