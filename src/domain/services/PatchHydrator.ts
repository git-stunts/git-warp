import VersionVector from '../crdt/VersionVector.ts';
import { Dot } from '../crdt/Dot.ts';
import PatchError from '../errors/PatchError.ts';
import Patch from '../types/Patch.ts';
import type { OpV2 } from '../types/ops/unions.ts';
import type { OpLike } from './OpLike.ts'; // nosemgrep: ts-no-like-types -- 0025C
import { hydrateKnownDecodedOp } from './OpNormalizer.ts';

type DecodedRecord = { readonly [key: string]: unknown };
type ContextValue = VersionVector | Record<string, number>;

const OP_NORMALIZERS = Object.freeze({
  BlobValue: normalizeDecodedBlobValue,
  EdgeAdd: normalizeDecodedEdgeAdd,
  EdgePropSet: normalizeDecodedEdgePropSet,
  EdgeRemove: normalizeDecodedEdgeRemove,
  NodeAdd: normalizeDecodedNodeAdd,
  NodePropSet: normalizeDecodedNodePropSet,
  NodeRemove: normalizeDecodedNodeRemove,
  PropSet: normalizeDecodedPropSet,
});

type DecodedOpType = keyof typeof OP_NORMALIZERS;

function failPatch(message: string, context?: DecodedRecord): never {
  throw new PatchError(message, context === undefined ? undefined : { context });
}

function isRecord(value: unknown): value is DecodedRecord {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

function isUnknownArray(value: unknown): value is readonly unknown[] { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return Array.isArray(value);
}

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

function isInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value);
}

function isStringArray(value: unknown): value is readonly string[] {
  return isUnknownArray(value) && value.every(isString);
}

function isStringSet(value: unknown): value is ReadonlySet<string> {
  return value instanceof Set && [...value].every(isString);
}

function isDecodedOpType(value: unknown): value is DecodedOpType {
  return isString(value) && Object.hasOwn(OP_NORMALIZERS, value);
}

function expectRecord(value: unknown, label: string): DecodedRecord { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!isRecord(value)) {
    failPatch(`Decoded patch ${label} must be an object`, {
      label,
      actual: typeof value,
    });
  }
  return value;
}

function expectArray(value: unknown, field: string): readonly unknown[] { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!isUnknownArray(value)) {
    failPatch(`Decoded patch field '${field}' must be an array`, {
      field,
      actual: typeof value,
    });
  }
  return value;
}

function readOptionalString(record: DecodedRecord, field: string): string | undefined {
  const value = record[field];
  return isString(value) ? value : undefined;
}

function readRequiredString(value: unknown, field: string): string { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!isString(value)) {
    failPatch(`Decoded patch requires string '${field}'`, {
      field,
      actual: typeof value,
    });
  }
  return value;
}

function readRequiredInteger(value: unknown, field: string): number { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (!isInteger(value)) {
    failPatch(`Decoded patch requires integer '${field}'`, {
      field,
      actual: typeof value,
    });
  }
  return value;
}

function readStringArray(value: unknown, field: string): string[] | undefined { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (value === null || value === undefined) {
    return undefined;
  }
  if (!isStringArray(value)) {
    failPatch(`Decoded patch field '${field}' must be an array of strings`, {
      field,
      actual: typeof value,
    });
  }
  return [...value];
}

function readContextFromMap(context: ReadonlyMap<unknown, unknown>): Record<string, number> { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const normalized: Record<string, number> = {};
  for (const [key, value] of context) {
    if (!isString(key) || !isInteger(value)) {
      failPatch('Decoded patch context Map must contain string -> number entries', {
        keyType: typeof key,
        valueType: typeof value,
      });
    }
    normalized[key] = value;
  }
  return normalized;
}

function readContextFromRecord(context: DecodedRecord): Record<string, number> {
  const normalized: Record<string, number> = {};
  for (const [key, value] of Object.entries(context)) {
    if (!isInteger(value)) {
      failPatch(`Decoded patch context '${key}' must be a number`, {
        key,
        actual: typeof value,
      });
    }
    normalized[key] = value;
  }
  return normalized;
}

function readContext(value: unknown): ContextValue { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (value === null || value === undefined) {
    return {};
  }
  if (value instanceof VersionVector) {
    return value;
  }
  if (value instanceof Map) {
    return readContextFromMap(value);
  }
  return readContextFromRecord(expectRecord(value, 'context'));
}

function readDotWriterId(dot: DecodedRecord, opType: string): string {
  const { writerId } = dot;
  if (isString(writerId)) {
    return writerId;
  }
  const { writer } = dot;
  if (isString(writer)) {
    return writer;
  }
  return failPatch(`${opType} dot requires writerId/writer`, {
    opType,
    actual: typeof writerId,
  });
}

function readDotCounter(dot: DecodedRecord, opType: string): number {
  const { counter } = dot;
  if (isInteger(counter)) {
    return counter;
  }
  const { seq } = dot;
  if (isInteger(seq)) {
    return seq;
  }
  return failPatch(`${opType} dot requires integer counter/seq`, {
    opType,
    actual: typeof counter,
  });
}

function readTupleDot(dot: readonly unknown[], opType: string): Dot { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const [writerId, counter] = dot;
  if (dot.length !== 2 || !isString(writerId) || !isInteger(counter)) {
    failPatch(`${opType} dot tuple must be [writerId, counter]`, {
      opType,
      actual: typeof dot,
    });
  }
  return new Dot(writerId, counter);
}

function readRecordDot(dot: DecodedRecord, opType: string): Dot {
  return new Dot(readDotWriterId(dot, opType), readDotCounter(dot, opType));
}

function normalizeDot(dot: unknown, opType: string): Dot { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (isUnknownArray(dot)) {
    return readTupleDot(dot, opType);
  }
  return readRecordDot(expectRecord(dot, `${opType}.dot`), opType);
}

function readObservedDots(record: DecodedRecord): Iterable<string> | undefined {
  const { observedDots } = record;
  if (isStringArray(observedDots) || isStringSet(observedDots)) {
    return observedDots;
  }
  return undefined;
}

function normalizeDecodedNodeAdd(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const node = readOptionalString(record, 'node') ?? readOptionalString(record, 'id');
  return {
    type: 'NodeAdd',
    ...(node !== undefined ? { node } : {}),
    dot: normalizeDot(record['dot'], 'NodeAdd'),
  };
}

function normalizeDecodedEdgeAdd(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const from = readOptionalString(record, 'from');
  const to = readOptionalString(record, 'to');
  const label = readOptionalString(record, 'label');
  return {
    type: 'EdgeAdd',
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(label !== undefined ? { label } : {}),
    dot: normalizeDot(record['dot'], 'EdgeAdd'),
  };
}

function normalizeDecodedNodeRemove(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const node = readOptionalString(record, 'node');
  const observedDots = readObservedDots(record);
  return {
    type: 'NodeRemove',
    ...(node !== undefined ? { node } : {}),
    ...(observedDots !== undefined ? { observedDots } : {}),
  };
}

function normalizeDecodedEdgeRemove(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const from = readOptionalString(record, 'from');
  const to = readOptionalString(record, 'to');
  const label = readOptionalString(record, 'label');
  const observedDots = readObservedDots(record);
  return {
    type: 'EdgeRemove',
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(observedDots !== undefined ? { observedDots } : {}),
  };
}

function normalizeDecodedPropSet(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const node = readOptionalString(record, 'node');
  const key = readOptionalString(record, 'key');
  return {
    type: 'PropSet',
    ...(node !== undefined ? { node } : {}),
    ...(key !== undefined ? { key } : {}),
    value: record['value'],
  };
}

function normalizeDecodedNodePropSet(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const node = readOptionalString(record, 'node');
  const key = readOptionalString(record, 'key');
  return {
    type: 'NodePropSet',
    ...(node !== undefined ? { node } : {}),
    ...(key !== undefined ? { key } : {}),
    value: record['value'],
  };
}

function normalizeDecodedEdgePropSet(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const from = readOptionalString(record, 'from');
  const to = readOptionalString(record, 'to');
  const label = readOptionalString(record, 'label');
  const key = readOptionalString(record, 'key');
  return {
    type: 'EdgePropSet',
    ...(from !== undefined ? { from } : {}),
    ...(to !== undefined ? { to } : {}),
    ...(label !== undefined ? { label } : {}),
    ...(key !== undefined ? { key } : {}),
    value: record['value'],
  };
}

function normalizeDecodedBlobValue(record: DecodedRecord): OpLike { // nosemgrep: ts-no-like-types -- 0025C
  const node = readOptionalString(record, 'node');
  const oid = readOptionalString(record, 'oid');
  return {
    type: 'BlobValue',
    ...(node !== undefined ? { node } : {}),
    ...(oid !== undefined ? { oid } : {}),
  };
}

function readDecodedOpType(record: DecodedRecord): DecodedOpType {
  const { type } = record;
  if (!isString(type)) {
    failPatch("Decoded op requires string 'type'", { actual: typeof type });
  }
  if (!isDecodedOpType(type)) {
    failPatch(`Decoded patch contains unknown op type '${type}'`, { opType: type }); // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  }
  return type;
}

function normalizeDecodedOp(rawOp: unknown): OpLike { // nosemgrep: ts-no-like-types -- 0025C; nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const record = expectRecord(rawOp, 'op');
  return OP_NORMALIZERS[readDecodedOpType(record)](record);
}

function readOps(value: unknown): OpV2[] { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const ops = expectArray(value, 'ops');
  const normalized: OpV2[] = [];
  for (const rawOp of ops) {
    normalized.push(hydrateKnownDecodedOp(normalizeDecodedOp(rawOp)));
  }
  return normalized;
}

export function hydrateDecodedPatch(decoded: unknown): Patch { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  const record = expectRecord(decoded, 'root');
  const { schema } = record;
  const { writer } = record;
  const { lamport } = record;

  return new Patch({
    schema: schema === 3 ? 3 : 2,
    writer: readRequiredString(writer, 'writer'),
    lamport: readRequiredInteger(lamport, 'lamport'),
    context: readContext(record['context']),
    ops: readOps(record['ops']),
    reads: readStringArray(record['reads'], 'reads'),
    writes: readStringArray(record['writes'], 'writes'),
  });
}
