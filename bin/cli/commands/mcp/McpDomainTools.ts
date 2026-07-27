import { z } from 'zod';

import type Runtime from '../../../../src/application/Runtime.ts';
import {
  JSON_INPUT_SCHEMA,
  intentFromValue,
  observerFromValue,
} from '../../v19/V19DomainInput.ts';
import {
  applyReviewedSettlement,
  previewReviewedSettlement,
  reviewSettlement,
} from '../../v19/V19SettlementReview.ts';
import {
  readingEnvelope,
  receiptEnvelope,
} from '../../../presenters/V19ReadingReceipt.ts';
import { toMcpJson } from '../../../presenters/V19Json.ts';
import type {
  McpJsonObject,
  McpJsonValue,
} from './McpJsonValue.ts';
import type McpRuntimeSession from './McpRuntimeSession.ts';
import type { McpDomainTool } from './McpDomainTool.ts';
import { MCP_DIAGNOSTIC_TOOLS } from './McpDiagnosticTools.ts';
import { parseMcpToolInput } from './McpToolInput.ts';

const LANE_SCHEMA = z.object({
  lane: z.string().min(1),
  strand: z.string().min(1).optional(),
}).strict();

const WRITE_SCHEMA = z.object({
  lane: z.string().min(1),
  strand: z.string().min(1).optional(),
  intent: z.record(z.string(), JSON_INPUT_SCHEMA),
}).strict();

const OBSERVATION_START_SCHEMA = z.object({
  lane: z.string().min(1),
  strand: z.string().min(1).optional(),
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

const PREVIEW_SCHEMA = z.object({
  sourceLane: z.string().min(1),
  sourceStrand: z.string().min(1),
  targetLane: z.string().min(1),
}).strict();

const APPLY_SCHEMA = z.object({
  planRef: z.string().min(1),
}).strict();

export const MCP_DOMAIN_TOOLS: ReadonlyMap<string, McpDomainTool> = new Map([
  ['warp_lane_describe', describeLane],
  ['warp_intent_write', writeIntent],
  ['warp_observation_start', startObservation],
  ['warp_observation_read', readObservation],
  ['warp_observation_cancel', cancelObservation],
  ['warp_receipt_get', getReceipt],
  ['warp_settlement_preview', previewSettlement],
  ['warp_settlement_apply', applySettlement],
  ...MCP_DIAGNOSTIC_TOOLS,
]);

async function describeLane(
  runtime: Runtime,
  _session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(LANE_SCHEMA, args);
  const lane = await openTransportLane(runtime, input);
  return Object.freeze({
    type: 'Lane',
    kind: lane.kind,
    name: lane.name,
    writer: lane.writer,
  });
}

async function writeIntent(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(WRITE_SCHEMA, args);
  const lane = await openTransportLane(runtime, input);
  const receipt = receiptEnvelope(
    await lane.write(intentFromValue(input.intent)),
  );
  const receiptRef = session.retainReceipt(receipt);
  return Object.freeze({ receiptRef, receipt });
}

async function startObservation(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(OBSERVATION_START_SCHEMA, args);
  const lane = await openTransportLane(runtime, input);
  const observation = lane.observe(
    observerFromValue(input.observerId, input.reading),
  );
  const readings: McpJsonValue[] = [];
  for await (const observed of observation) {
    readings.push(readingEnvelope(observed));
  }
  const receipt = receiptEnvelope(await observation.receipt);
  const receiptRef = session.retainReceipt(receipt);
  const observationId = session.retainObservation(
    readings,
    receiptRef,
  );
  return Object.freeze({
    observationId,
    terminal: readings.length === 0,
    receiptRef: readings.length === 0 ? receiptRef : null,
  });
}

function readObservation(
  _runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(OBSERVATION_READ_SCHEMA, args);
  return Promise.resolve(
    session.readObservation(
      input.observationId,
      input.cursor,
      input.limit ?? 64,
    ),
  );
}

function cancelObservation(
  _runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { observationId } = parseMcpToolInput(
    OBSERVATION_ID_SCHEMA,
    args,
  );
  return Promise.resolve(session.cancelObservation(observationId));
}

function getReceipt(
  _runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { receiptRef } = parseMcpToolInput(RECEIPT_SCHEMA, args);
  return Promise.resolve(session.getReceipt(receiptRef));
}

async function previewSettlement(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const input = parseMcpToolInput(PREVIEW_SCHEMA, args);
  const selector = Object.freeze({
    sourceLane: input.sourceLane,
    sourceStrand: input.sourceStrand,
    targetLane: input.targetLane,
  });
  const preview = await previewReviewedSettlement(runtime, selector);
  const planRef = session.retainPlan(
    reviewSettlement(selector, preview.plan),
  );
  return Object.freeze({
    type: 'SettlementPreview',
    planRef,
    source: toMcpJson(preview.source),
    target: toMcpJson(preview.target),
    plan: toMcpJson(preview.plan),
    outcome: toMcpJson(preview.outcome),
    evidence: toMcpJson(preview.evidence),
  });
}

async function applySettlement(
  runtime: Runtime,
  session: McpRuntimeSession,
  args: McpJsonObject,
): Promise<McpJsonValue> {
  const { planRef } = parseMcpToolInput(APPLY_SCHEMA, args);
  const receipt = receiptEnvelope(
    await applyReviewedSettlement(runtime, session.getPlan(planRef)),
  );
  const receiptRef = session.retainReceipt(receipt);
  return Object.freeze({ receiptRef, receipt });
}

async function openTransportLane(
  runtime: Runtime,
  selector: Readonly<{
    readonly lane: string;
    readonly strand?: string | undefined;
  }>,
) {
  const lane = await runtime.lane(selector.lane);
  return selector.strand === undefined
    ? lane
    : await runtime.strand(lane, { name: selector.strand });
}
