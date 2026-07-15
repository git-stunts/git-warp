import QueryError from '../../errors/QueryError.ts';
import {
  BlobValue,
  EdgeAdd,
  EdgePropSet,
  EdgeRemove,
  NodeAdd,
  NodePropSet,
  NodeRemove,
} from '../../types/ops/index.ts';
import { isPropValue } from '../../types/PropValue.ts';
import { EventId } from '../../utils/EventId.ts';
import MemoryBudgetError from '../../errors/MemoryBudgetError.ts';
import WarpMemoryPool from '../../memory/WarpMemoryPool.ts';
import AssetHandle from '../../storage/AssetHandle.ts';
import { normalizeRawOp } from '../OpNormalizer.ts';
import {
  CheckpointAdjacencyFact,
  type CheckpointBasisFact,
  CheckpointContentAnchorFact,
  CheckpointEdgeFact,
  CheckpointNodeLivenessFact,
  CheckpointNodePropertyFact,
  CheckpointProvenanceFact,
} from './CheckpointBasisFact.ts';
import {
  closeFactCursors,
  compareFactEvents,
  type FactStreamCursor,
  type FactWithEvent,
  readNextFactCursor,
  selectFactCursorIndex,
  sortedOperationFacts,
} from './CheckpointPatchFactCursor.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';
import type {
  CheckpointTailCheckpointFrontier,
  CheckpointTailPatchEntry,
} from './CheckpointTailOpticSource.ts';

export type CheckpointPatchFactStreamOptions = {
  readonly source: CheckpointTailOpticSource;
};

export type CheckpointPatchFactStreamReadOptions = {
  readonly previousCheckpoint: CheckpointTailCheckpointFrontier;
  readonly targetFrontier: Map<string, string>;
};

export type CheckpointPatchFactStreamBoundedReadOptions = CheckpointPatchFactStreamReadOptions & {
  readonly pool: WarpMemoryPool;
};

type NormalizedPatchOperation = ReturnType<typeof normalizeRawOp>;

const CHECKPOINT_PATCH_FACT_SCOPE = 'checkpoint.patch.fact';
const FACT_CURSOR_ERROR_FIELD = 'factCursor';
const INVALID_CURSOR_SELECTION_REASON = 'invalid-cursor-selection';

export default class CheckpointPatchFactStream {
  private readonly _source: CheckpointTailOpticSource;

  constructor(options: CheckpointPatchFactStreamOptions) {
    validateSource(options.source);
    this._source = options.source;
    Object.freeze(this);
  }

  async *stream(options: CheckpointPatchFactStreamReadOptions): AsyncIterable<CheckpointBasisFact> {
    validateCheckpoint(options.previousCheckpoint);
    validateFrontier(options.targetFrontier, 'targetFrontier');
    const entries = await this._collectEntries(options);
    const facts = lowerEntriesToFacts(entries);
    for (const fact of facts) {
      yield fact.fact;
    }
  }

  async *streamBounded(
    options: CheckpointPatchFactStreamBoundedReadOptions,
  ): AsyncIterable<CheckpointBasisFact> {
    const validOptions = requireBoundedReadOptions(options);
    validateCheckpoint(validOptions.previousCheckpoint);
    validateFrontier(validOptions.targetFrontier, 'targetFrontier');
    const pool = requireMemoryPool(validOptions.pool);
    const cursors = await this._openWriterCursors(validOptions, pool);
    try {
      while (cursors.length > 0) {
        const selectedIndex = selectFactCursorIndex(cursors);
        const selected = cursors[selectedIndex];
        if (selected === undefined) {
          throwStreamError(FACT_CURSOR_ERROR_FIELD, INVALID_CURSOR_SELECTION_REASON);
        }
        yield selected.current.fact;
        const nextCursor = await readNextFactCursor(selected.writerId, selected.iterator);
        if (nextCursor === null) {
          cursors.splice(selectedIndex, 1);
        } else {
          cursors[selectedIndex] = nextCursor;
        }
      }
    } finally {
      await closeFactCursors(cursors);
    }
  }

  private async _openWriterCursors(
    options: CheckpointPatchFactStreamReadOptions,
    pool: WarpMemoryPool,
  ): Promise<FactStreamCursor[]> {
    const cursors: FactStreamCursor[] = [];
    try {
      for (const writerId of sortedWriterIds(options.targetFrontier)) {
        const iterator = this._streamWriterFacts({ writerId, options, pool })[Symbol.asyncIterator]();
        const cursor = await readNextFactCursor(writerId, iterator);
        if (cursor !== null) {
          cursors.push(cursor);
        }
      }
      return cursors;
    } catch (error) {
      await closeFactCursors(cursors);
      throw error;
    }
  }

  private async _collectEntries(
    options: CheckpointPatchFactStreamReadOptions,
  ): Promise<readonly CheckpointTailPatchEntry[]> {
    const entries: CheckpointTailPatchEntry[] = [];
    for (const writerId of sortedWriterIds(options.targetFrontier)) {
      const writerEntries = await this._loadWriterEntries({
        writerId,
        previousCheckpoint: options.previousCheckpoint,
        targetFrontier: options.targetFrontier,
      });
      entries.push(...writerEntries);
    }
    return Object.freeze(entries);
  }

  private async *_streamWriterFacts(options: {
    readonly writerId: string;
    readonly options: CheckpointPatchFactStreamReadOptions;
    readonly pool: WarpMemoryPool;
  }): AsyncIterable<FactWithEvent> {
    const writerEntries = await this._loadWriterEntries({
      writerId: options.writerId,
      previousCheckpoint: options.options.previousCheckpoint,
      targetFrontier: options.options.targetFrontier,
    });
    for (const entry of writerEntries) {
      yield* this._streamEntryFacts(entry, options.pool);
    }
  }

  private *_streamEntryFacts(
    entry: CheckpointTailPatchEntry,
    pool: WarpMemoryPool,
  ): Iterable<FactWithEvent> {
    for (const fact of lowerEntryFacts(entry)) {
      const factLease = pool.acquire({ scope: CHECKPOINT_PATCH_FACT_SCOPE, amount: 1 });
      try {
        yield fact;
      } finally {
        factLease.release();
      }
    }
  }

  private async _loadWriterEntries(options: {
    readonly writerId: string;
    readonly previousCheckpoint: CheckpointTailCheckpointFrontier;
    readonly targetFrontier: Map<string, string>;
  }): Promise<readonly CheckpointTailPatchEntry[]> {
    const targetTip = options.targetFrontier.get(options.writerId);
    if (targetTip === undefined) {
      return Object.freeze([]);
    }
    const stopAtSha = options.previousCheckpoint.frontier.get(options.writerId) ?? null;
    if (targetTip === stopAtSha) {
      return Object.freeze([]);
    }
    const entries = await this._source._loadPatchChainFromSha(targetTip, stopAtSha);
    await this._validateCoverage(options.writerId, entries, options.previousCheckpoint);
    return Object.freeze(entries);
  }

  private async _validateCoverage(
    writerId: string,
    entries: readonly CheckpointTailPatchEntry[],
    previousCheckpoint: CheckpointTailCheckpointFrontier,
  ): Promise<void> {
    const lastEntry = entries[entries.length - 1];
    if (lastEntry === undefined) {
      return;
    }
    try {
      await this._source._validatePatchAgainstCheckpoint(writerId, lastEntry.sha, previousCheckpoint);
    } catch (error) {
      const cause = error instanceof Error ? error.message : null;
      throwStreamError('previousCheckpoint', 'checkpoint-coverage-obstructed', cause);
    }
  }
}

function lowerEntriesToFacts(entries: readonly CheckpointTailPatchEntry[]): readonly FactWithEvent[] {
  const facts: FactWithEvent[] = [];
  for (const entry of entries) {
    facts.push(...lowerEntryToFacts(entry));
  }
  return Object.freeze(facts.sort(compareFactEvents));
}

function lowerEntryToFacts(entry: CheckpointTailPatchEntry): readonly FactWithEvent[] {
  return Object.freeze([...lowerEntryFacts(entry)]);
}

function* lowerEntryFacts(entry: CheckpointTailPatchEntry): Iterable<FactWithEvent> {
  validatePatchEntry(entry);
  for (let opIndex = 0; opIndex < entry.patch.ops.length; opIndex += 1) {
    const rawOp = entry.patch.ops[opIndex];
    if (rawOp !== undefined) {
      yield* sortedOperationFacts(lowerOperation(entry, rawOp, opIndex));
    }
  }
}

function lowerOperation(
  entry: CheckpointTailPatchEntry,
  rawOp: CheckpointTailPatchEntry['patch']['ops'][number],
  opIndex: number,
): readonly FactWithEvent[] {
  try {
    const eventId = new EventId(entry.patch.lamport, entry.patch.writer, entry.sha, opIndex);
    const op = normalizeRawOp(rawOp);
    return factsForOperation(op, eventId);
  } catch (error) {
    if (isUnsupportedOperationError(error)) {
      throw error;
    }
    const cause = error instanceof Error ? error.message : null;
    return malformedOperationFacts(cause);
  }
}

function isUnsupportedOperationError(error: unknown): error is QueryError { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  return error instanceof QueryError
    && error.code === 'E_CHECKPOINT_PATCH_FACT_STREAM'
    && error.context['reason'] === 'unsupported-operation';
}

function factsForOperation(
  op: NormalizedPatchOperation,
  eventId: EventId,
): readonly FactWithEvent[] {
  const nodeFacts = factsForNodeOperation(op, eventId);
  if (nodeFacts !== null) {
    return nodeFacts;
  }
  const edgeOperationFacts = factsForEdgeOperation(op, eventId);
  if (edgeOperationFacts !== null) {
    return edgeOperationFacts;
  }
  const contentFacts = factsForContentOperation(op, eventId);
  if (contentFacts !== null) {
    return contentFacts;
  }
  return unsupportedOperationFacts();
}

function factsForNodeOperation(
  op: NormalizedPatchOperation,
  eventId: EventId,
): readonly FactWithEvent[] | null {
  if (op instanceof NodeAdd) {
    return factsWithProvenance([
      new CheckpointNodeLivenessFact({ nodeId: op.node, alive: true, eventId }),
    ], op.node, eventId);
  }
  if (op instanceof NodeRemove) {
    return factsWithProvenance([
      new CheckpointNodeLivenessFact({ nodeId: op.node, alive: false, eventId }),
    ], op.node, eventId);
  }
  if (op instanceof NodePropSet) {
    return nodePropertyFacts(op, eventId);
  }
  return null;
}

function factsForEdgeOperation(
  op: NormalizedPatchOperation,
  eventId: EventId,
): readonly FactWithEvent[] | null {
  if (op instanceof EdgeAdd) {
    return edgeFacts({ from: op.from, to: op.to, label: op.label, alive: true, eventId });
  }
  if (op instanceof EdgeRemove) {
    return edgeFacts({ from: op.from, to: op.to, label: op.label, alive: false, eventId });
  }
  if (op instanceof EdgePropSet) {
    return factsWithProvenance([
      new CheckpointEdgeFact({
        from: op.from,
        to: op.to,
        label: op.label,
        alive: true,
        eventId,
      }),
    ], edgeTarget(op.from, op.to, op.label), eventId);
  }
  return null;
}

function factsForContentOperation(
  op: NormalizedPatchOperation,
  eventId: EventId,
): readonly FactWithEvent[] | null {
  if (op instanceof BlobValue) {
    return factsWithProvenance([
      new CheckpointContentAnchorFact({
        owner: op.node,
        contentHandle: new AssetHandle(op.oid),
        eventId,
      }),
    ], op.node, eventId);
  }
  return null;
}

function nodePropertyFacts(op: NodePropSet, eventId: EventId): readonly FactWithEvent[] {
  const { value } = op;
  if (!isPropValue(value)) {
    throwStreamError('patch.ops.value', 'malformed-patch');
  }
  return factsWithProvenance([
    new CheckpointNodePropertyFact({
      nodeId: op.node,
      key: op.key,
      value,
      eventId,
    }),
  ], `${op.node}:${op.key}`, eventId);
}

function edgeFacts(options: {
  readonly from: string;
  readonly to: string;
  readonly label: string;
  readonly alive: boolean;
  readonly eventId: EventId;
}): readonly FactWithEvent[] {
  const { from, to, label, alive, eventId } = options;
  const target = edgeTarget(from, to, label);
  return factsWithProvenance([
    new CheckpointAdjacencyFact({ direction: 'outgoing', from, to, label, alive, eventId }),
    new CheckpointAdjacencyFact({ direction: 'incoming', from, to, label, alive, eventId }),
    new CheckpointEdgeFact({ from, to, label, alive, eventId }),
  ], target, eventId);
}

function factsWithProvenance(
  facts: readonly CheckpointBasisFact[],
  target: string,
  eventId: EventId,
): readonly FactWithEvent[] {
  const wrapped: FactWithEvent[] = [];
  for (const fact of facts) {
    wrapped.push(Object.freeze({ fact, eventId }));
  }
  wrapped.push(Object.freeze({
    fact: new CheckpointProvenanceFact({
      target,
      patchSha: eventId.patchSha,
      writerId: eventId.writerId,
      lamport: eventId.lamport,
    }),
    eventId,
  }));
  return Object.freeze(wrapped);
}

function sortedWriterIds(frontier: Map<string, string>): readonly string[] {
  return Object.freeze([...frontier.keys()].sort());
}

function edgeTarget(from: string, to: string, label: string): string {
  return `${from}->${to}:${label}`;
}

function malformedOperationFacts(cause: string | null): never {
  throwStreamError('patch.ops', 'malformed-patch', cause);
}

function unsupportedOperationFacts(): never {
  throwStreamError('patch.ops', 'unsupported-operation');
}

function validateSource(source: CheckpointTailOpticSource): void {
  if (
    source === null
    || source === undefined
    || typeof source._loadPatchChainFromSha !== 'function'
    || typeof source._validatePatchAgainstCheckpoint !== 'function'
  ) {
    throwStreamError('source', 'invalid-source');
  }
}

function requireMemoryPool(pool: WarpMemoryPool): WarpMemoryPool {
  if (pool instanceof WarpMemoryPool) {
    return pool;
  }
  throw new MemoryBudgetError('Checkpoint patch fact stream requires a WarpMemoryPool', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'pool' },
  });
}

function requireBoundedReadOptions(
  options: CheckpointPatchFactStreamBoundedReadOptions | null | undefined,
): CheckpointPatchFactStreamBoundedReadOptions {
  if (options !== null && typeof options === 'object') {
    return options;
  }
  return throwStreamError('options', 'invalid-bounded-read-options');
}

function validateCheckpoint(checkpoint: CheckpointTailCheckpointFrontier): void {
  if (
    checkpoint === null
    || checkpoint === undefined
    || typeof checkpoint.schema !== 'number'
    || !(checkpoint.frontier instanceof Map)
  ) {
    throwStreamError('previousCheckpoint', 'invalid-checkpoint');
  }
  validateFrontier(checkpoint.frontier, 'previousCheckpoint.frontier');
}

function validateFrontier(frontier: Map<string, string>, field: string): void {
  if (!(frontier instanceof Map)) {
    throwStreamError(field, 'invalid-frontier');
  }
  for (const [writerId, patchSha] of frontier) {
    validateText(writerId, `${field}.writerId`);
    validateText(patchSha, `${field}.patchSha`);
  }
}

function validatePatchEntry(entry: CheckpointTailPatchEntry): void {
  if (isMalformedPatchEntry(entry)) {
    throwStreamError('patch', 'malformed-patch');
  }
}

function isMalformedPatchEntry(entry: CheckpointTailPatchEntry): boolean {
  return entry === null
    || entry === undefined
    || typeof entry.sha !== 'string'
    || !hasPatchShape(entry);
}

function hasPatchShape(entry: CheckpointTailPatchEntry): boolean {
  return entry.patch !== null
    && entry.patch !== undefined
    && typeof entry.patch.writer === 'string'
    && typeof entry.patch.lamport === 'number'
    && Array.isArray(entry.patch.ops);
}

function validateText(value: string, field: string): void {
  if (typeof value !== 'string' || value.length === 0) {
    throwStreamError(field, 'empty-string');
  }
}

function throwStreamError(field: string, reason: string, cause?: string | null): never {
  throw new QueryError('Checkpoint patch fact stream is obstructed.', {
    code: 'E_CHECKPOINT_PATCH_FACT_STREAM',
    context: {
      field,
      reason,
      cause: cause ?? null,
    },
  });
}
