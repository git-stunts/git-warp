import type ObservedReading from '../../src/domain/api/ObservedReading.ts';
import type ObservationReceipt from '../../src/domain/api/ObservationReceipt.ts';
import type SettlementReceipt from '../../src/domain/api/SettlementReceipt.ts';
import type WriteReceipt from '../../src/domain/api/WriteReceipt.ts';
import type Evidence from '../../src/domain/api/Evidence.ts';
import type RetentionEvidence from '../../src/domain/api/RetentionEvidence.ts';
import type { ReadingValue } from '../../src/domain/api/ReadingValue.ts';
import ImmutableBytes from '../../src/domain/services/snapshot/ImmutableBytes.ts';
import type { McpJsonValue } from '../cli/commands/mcp/McpJsonValue.ts';
import { settlementPlanFields } from '../cli/v19/V19SettlementReview.ts';
import { stableStringify } from './json.ts';
import { toMcpJson } from './V19Json.ts';
import WarpError from '../../src/domain/errors/WarpError.ts';

export type V19Receipt = WriteReceipt | ObservationReceipt | SettlementReceipt;

export function readingEnvelope(reading: ObservedReading): McpJsonValue {
  return Object.freeze({
    type: 'Reading',
    value: readingValueToJson(reading.value),
    coordinate: readingCoordinateEnvelope(reading.coordinate),
    support: toMcpJson(reading.support),
    witnessRefs: toMcpJson([...reading.witnessRefs]),
  });
}

export function receiptEnvelope(receipt: V19Receipt): McpJsonValue {
  if (receipt.operation === 'write') {
    return writeReceiptEnvelope(receipt);
  }
  if (receipt.operation === 'observe') {
    return observationReceiptEnvelope(receipt);
  }
  return settlementReceiptEnvelope(receipt);
}

function writeReceiptEnvelope(receipt: WriteReceipt): McpJsonValue {
  return Object.freeze({
    type: 'Receipt',
    operation: receipt.operation,
    lane: receipt.lane,
    writer: receipt.writer,
    intent: toMcpJson(receipt.intent.descriptor),
    outcome: toMcpJson(receipt.outcome),
    reason: receipt.reason ?? null,
    occurrence:
      receipt.occurrence === undefined
        ? null
        : Object.freeze({
            id: receipt.occurrence.id,
            subject: receipt.occurrence.subject,
          }),
    evidence: evidenceEnvelope(receipt.evidence),
    repairHints: toMcpJson([...receipt.repairHints]),
  });
}

function observationReceiptEnvelope(receipt: ObservationReceipt): McpJsonValue {
  return Object.freeze({
    type: 'Receipt',
    operation: receipt.operation,
    lane: receipt.lane,
    writer: receipt.writer,
    observer: Object.freeze({
      id: receipt.observer.id,
      cardinality: receipt.observer.cardinality,
    }),
    status: receipt.status,
    reason: receipt.reason ?? null,
    evidence: receipt.evidence === undefined ? null : evidenceEnvelope(receipt.evidence),
    repairHints: toMcpJson([...receipt.repairHints]),
  });
}

function settlementReceiptEnvelope(receipt: SettlementReceipt): McpJsonValue {
  return Object.freeze({
    type: 'Receipt',
    operation: receipt.operation,
    source: toMcpJson(receipt.source),
    target: toMcpJson(receipt.target),
    plan: toMcpJson(settlementPlanFields(receipt.plan)),
    outcome: toMcpJson(receipt.outcome),
    reason: receipt.reason ?? null,
    evidence: evidenceEnvelope(receipt.evidence),
    repairHints: toMcpJson([...receipt.repairHints]),
  });
}

export function evidenceEnvelope(evidence: Evidence): McpJsonValue {
  const envelope: { [key: string]: McpJsonValue } = {
    basis: evidenceHandleEnvelope(evidence.basis),
    support: Object.freeze(evidence.support.map(evidenceHandleEnvelope)),
  };
  if (evidence.retention !== undefined) {
    envelope['retention'] = Object.freeze(evidence.retention.map(retentionEvidenceEnvelope));
  }
  if (evidence.tick !== undefined) {
    envelope['tick'] = Object.freeze({
      id: evidence.tick.id,
      timeline: evidence.tick.timeline,
    });
  }
  return Object.freeze(envelope);
}

function readingCoordinateEnvelope(coordinate: ObservedReading['coordinate']): McpJsonValue {
  return Object.freeze({
    basis: evidenceHandleEnvelope(coordinate.basis),
    lane: coordinate.lane,
    ...(coordinate.tick === undefined
      ? {}
      : {
          tick: Object.freeze({
            id: coordinate.tick.id,
            lane: coordinate.tick.lane,
          }),
        }),
  });
}

function evidenceHandleEnvelope(handle: Readonly<{ readonly id: string }>): McpJsonValue {
  return Object.freeze({ id: handle.id });
}

function retentionEvidenceEnvelope(retention: RetentionEvidence): McpJsonValue {
  return Object.freeze({
    witness: evidenceHandleEnvelope(retention.witness),
    policy: retention.policy,
    reachability: retention.reachability,
    rootKind: retention.rootKind,
  });
}

export function renderReading(reading: McpJsonValue): string {
  if (!isJsonObject(reading) || reading['type'] !== 'Reading') {
    throw presentationError('Expected a canonical Reading envelope');
  }
  return [
    'Reading',
    `value: ${stableStringify(reading['value'])}`,
    `coordinate: ${stableStringify(reading['coordinate'])}`,
    `support: ${stableStringify(reading['support'])}`,
  ].join('\n');
}

export function renderReceipt(receipt: McpJsonValue): string {
  if (!isJsonObject(receipt) || receipt['type'] !== 'Receipt') {
    throw presentationError('Expected a canonical Receipt envelope');
  }
  const operation = requireString(receipt['operation'], 'Receipt.operation');
  const resolution = receipt['status'] ?? receipt['outcome'];
  return [
    `Receipt: ${operation}`,
    `resolution: ${stableStringify(resolution)}`,
    `details: ${stableStringify(receipt)}`,
  ].join('\n');
}

function readingValueToJson(value: ReadingValue): McpJsonValue {
  if (value instanceof ImmutableBytes) {
    return Object.freeze({
      type: 'bytes',
      value: Object.freeze(value.toArray()),
    });
  }
  if (isReadingValueArray(value)) {
    return Object.freeze(value.map(readingValueToJson));
  }
  if (isReadingValueObject(value)) {
    const record: { [key: string]: McpJsonValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      record[key] = readingValueToJson(entry);
    }
    return Object.freeze(record);
  }
  return value;
}

function isReadingValueObject(
  value: ReadingValue
): value is { readonly [key: string]: ReadingValue } {
  return (
    value !== null &&
    typeof value === 'object' &&
    !isReadingValueArray(value) &&
    !(value instanceof ImmutableBytes)
  );
}

function isReadingValueArray(value: ReadingValue): value is readonly ReadingValue[] {
  return Array.isArray(value);
}

function isJsonObject(value: McpJsonValue): value is { readonly [key: string]: McpJsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireString(value: McpJsonValue | undefined, field: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw presentationError(`${field} must be a non-empty string`);
  }
  return value;
}

function presentationError(message: string): WarpError {
  return new WarpError(message, 'E_V19_PRESENTATION');
}
