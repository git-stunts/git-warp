import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type ReadIdentity from '../services/optic/ReadIdentity.ts';
import type { NeighborhoodOpticReadOptions } from '../services/optic/NeighborhoodOptic.ts';
import type NeighborhoodOpticReadResult from '../services/optic/NeighborhoodOpticReadResult.ts';
import type WorldlineOptic from '../services/optic/WorldlineOptic.ts';
import { createSnapshotPropValue } from '../services/ImmutableSnapshot.ts';
import type { SnapshotPropValue } from '../services/snapshot/SnapshotPropValue.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import { createReadEvidence } from './EvidenceRuntime.ts';
import type Reading from './Reading.ts';
import type { ReadingDescriptor, ReadingKind } from './Reading.ts';
import ReadReceipt, { type ReadReceiptOutcome } from './ReadReceipt.ts';
import type { RepairHint } from './ReceiptSupport.ts';
import ReadingResult from './ReadingResult.ts';
import type Tick from './Tick.ts';

type BoundedReading = {
  readonly evidence: ReadIdentity;
  readonly value: SnapshotPropValue;
};

type ReadingExecutor = (
  descriptor: ReadingDescriptor,
  optic: WorldlineOptic
) => Promise<BoundedReading>;

type ReadingBasis = {
  readonly optic: WorldlineOptic;
  readonly tick: Tick;
};

type ReadingExecutionFields = {
  readonly runtime: WarpWorldline;
  readonly context: ApiRuntimeContext;
  readonly reading: Reading;
  readonly basis?: ReadingBasis;
};

type AcceptedReadingFields = Omit<ReadingExecutionFields, 'basis'> & {
  readonly basis: ReadingBasis | undefined;
  readonly result: BoundedReading;
};

type UnresolvedReadingFields = ReadingExecutionFields & {
  readonly failure: OperationalReadFailure;
};

type OperationalReadFailure = {
  readonly outcome: Exclude<ReadReceiptOutcome, 'accepted' | 'rejected'>;
  readonly reason: string;
  readonly repairHints: readonly RepairHint[];
};

const REPAIR_BOUNDED_BASIS = Object.freeze([
  Object.freeze({
    code: 'repair_bounded_basis',
    message:
      'Create the timeline checkpoint, or repair its state-cache retention, before retrying.',
  }),
]);

const readers: ReadonlyMap<ReadingKind, ReadingExecutor> = new Map([
  ['property.get', readProperty],
  ['node.exists', readNodeExists],
  ['neighborhood', readNeighborhood],
]);

export async function executeReading(fields: ReadingExecutionFields): Promise<ReadingResult> {
  try {
    return await executeResolvedReading(fields);
  } catch (error) {
    if (!(error instanceof WarpError)) {
      throw error;
    }
    return handleReadingFailure(fields, error);
  }
}

async function executeResolvedReading(fields: ReadingExecutionFields): Promise<ReadingResult> {
  const { runtime, context, reading, basis } = fields;
  const reader = requireReader(reading.kind);
  const result = await reader(reading.descriptor, basis?.optic ?? runtime.optic());
  return await readingResult({ runtime, context, reading, basis, result });
}

function handleReadingFailure(fields: ReadingExecutionFields, error: WarpError): ReadingResult {
  const failure = operationalReadFailure(error);
  if (failure === null) {
    throw error;
  }
  return unresolvedReadingResult({ ...fields, failure });
}

function requireReader(kind: ReadingKind): ReadingExecutor {
  const reader = readers.get(kind);
  if (reader === undefined) {
    throw new WarpError('Reading kind is unsupported', 'E_READING_KIND');
  }
  return reader;
}

async function readProperty(
  descriptor: ReadingDescriptor,
  optic: WorldlineOptic
): Promise<BoundedReading> {
  if (descriptor.kind !== 'property.get') {
    throw new WarpError('Reading executor received a mismatched descriptor', 'E_READING_KIND');
  }
  const result = await optic.node(descriptor.subject).prop(descriptor.key).read();
  return {
    value: result.value === undefined ? null : createSnapshotPropValue(result.value),
    evidence: result.readIdentity,
  };
}

async function readNodeExists(
  descriptor: ReadingDescriptor,
  optic: WorldlineOptic
): Promise<BoundedReading> {
  if (descriptor.kind !== 'node.exists') {
    throw new WarpError('Reading executor received a mismatched descriptor', 'E_READING_KIND');
  }
  const result = await optic.node(descriptor.subject).read();
  return { value: result.alive, evidence: result.readIdentity };
}

async function readNeighborhood(
  descriptor: ReadingDescriptor,
  optic: WorldlineOptic
): Promise<BoundedReading> {
  if (descriptor.kind !== 'neighborhood') {
    throw new WarpError('Reading executor received a mismatched descriptor', 'E_READING_KIND');
  }
  const result = await optic.neighborhood(descriptor.subject).read(neighborhoodOptions(descriptor));
  return { evidence: result.readIdentity, value: neighborhoodValue(result) };
}

function neighborhoodOptions(
  descriptor: Extract<ReadingDescriptor, { readonly kind: 'neighborhood' }>
): NeighborhoodOpticReadOptions {
  const options: {
    direction?: 'out' | 'in' | 'both';
    labels?: readonly string[];
    limit?: number;
    cursor?: string;
  } = {};
  if (descriptor.direction !== undefined) {
    options.direction = descriptor.direction;
  }
  if (descriptor.labels !== undefined) {
    options.labels = descriptor.labels;
  }
  if (descriptor.limit !== undefined) {
    options.limit = descriptor.limit;
  }
  if (descriptor.cursor !== undefined) {
    options.cursor = descriptor.cursor;
  }
  return options;
}

function neighborhoodValue(result: NeighborhoodOpticReadResult): SnapshotPropValue {
  const edges = result.edges.map((edge) =>
    Object.freeze({
      direction: edge.direction,
      neighborId: edge.neighborId,
      label: edge.label,
    })
  );
  return Object.freeze({
    subject: result.nodeId,
    direction: result.direction,
    edges: Object.freeze(edges),
    completeness: result.completeness,
    cursor: result.cursor,
  });
}

async function readingResult(fields: AcceptedReadingFields): Promise<ReadingResult> {
  const { runtime, context, reading, result, basis } = fields;
  const receipt = new ReadReceipt({
    timeline: runtime.worldlineName,
    writer: runtime.writerId,
    reading,
    outcome: 'accepted',
    evidence: await createReadEvidence(context, result.evidence, basis?.tick),
  });
  context.bindReceipt(receipt, { operation: 'read', identity: result.evidence });
  return new ReadingResult({
    value: result.value,
    receipt,
  });
}

function unresolvedReadingResult(fields: UnresolvedReadingFields): ReadingResult {
  const { runtime, context, reading, failure } = fields;
  const receipt = new ReadReceipt({
    timeline: runtime.worldlineName,
    writer: runtime.writerId,
    reading,
    ...failure,
  });
  context.bindReceipt(receipt, { operation: 'read', identity: undefined });
  return new ReadingResult({
    value: null,
    receipt,
  });
}

function operationalReadFailure(error: WarpError): OperationalReadFailure | null {
  if (error.code === 'E_OPTIC_NO_BOUNDED_BASIS') {
    return {
      outcome: 'obstructed',
      reason: 'missing_bounded_basis',
      repairHints: REPAIR_BOUNDED_BASIS,
    };
  }
  if (error.code === 'E_OPTIC_TAIL_BUDGET_EXCEEDED') {
    return {
      outcome: 'underdetermined',
      reason: 'tail_budget_exceeded',
      repairHints: REPAIR_BOUNDED_BASIS,
    };
  }
  return null;
}
