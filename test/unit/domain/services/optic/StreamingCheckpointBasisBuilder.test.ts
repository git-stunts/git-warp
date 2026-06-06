import { describe, expect, it } from 'vitest';

import MemoryBudgetError from '../../../../../src/domain/errors/MemoryBudgetError.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
import {
  CheckpointNodeLivenessFact,
  type CheckpointBasisFact,
  type CheckpointBasisFactTransport,
} from '../../../../../src/domain/services/optic/CheckpointBasisFact.ts';
import StreamingCheckpointBasisBuilder from '../../../../../src/domain/services/optic/StreamingCheckpointBasisBuilder.ts';
import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

describe('StreamingCheckpointBasisBuilder', () => {
  it('flushes sorted fact chunks to storage and emits a manifest', async () => {
    const storage = new RecordingCheckpointBasisStorage();
    const builder = builderFixture(storage, 2);

    const result = await builder.build(facts([
      nodeAliveWithPatch(2, 'bbbb'),
      nodeAliveWithPatch(1, 'aaaa'),
      nodeAliveWithPatch(3, 'cccc'),
      nodeAliveWithPatch(4, 'dddd'),
      nodeAliveWithPatch(5, 'eeee'),
    ]));

    expect(result.flushCount).toBe(3);
    expect(result.shardWriteCount).toBe(3);
    expect(result.rootTreeOid).toBe('tree-0001');
    expect(result.treeEntries).toHaveLength(3);
    expect(result.treeEntries[0]).toContain('node-liveness/liveness_');
    expect(result.treeEntries[0]).toContain('.chunk-000001');
    expect(result.manifest.livenessRoots.size).toBe(3);
    expect(result.manifest.propertyRoots.size).toBe(0);
    expect(result.manifest.provenancePosture.kind).toBe('unavailable');
    expect(result.manifest.contentAnchorPosture.kind).toBe('unavailable');
    expect(result.manifest.completeness.kind).toBe('complete');

    const firstChunk = decodeChunk(storage.requiredBlob(0));
    expect(firstChunk.map((fact) => fact.kind)).toEqual(['node-liveness', 'node-liveness']);
    expect(firstChunk.map((fact) => eventPatchSha(fact))).toEqual(['aaaa', 'bbbb']);
  });

  it('builds checkpoint basis shards while releasing pending-fact leases', async () => {
    const storage = new RecordingCheckpointBasisStorage();
    const pool = new WarpMemoryPool({ name: 'streaming-checkpoint-basis', budget: MemoryBudget.facts(2) });
    const builder = builderFixture(storage, 2, pool);

    const result = await builder.build(facts([
      nodeAlive('task:bounded', 1),
      nodeAlive('task:bounded', 2),
      nodeAlive('task:bounded', 3),
      nodeAlive('task:bounded', 4),
      nodeAlive('task:bounded', 5),
    ]));

    expect(result.flushCount).toBe(3);
    expect(result.shardWriteCount).toBe(3);
    expect(result.manifest.chunking.maxFactsPerShard).toBe(2);
    expect(result.manifest.chunking.chunkCount).toBe(3);
    expect(result.manifest.completeness.kind).toBe('complete');
    expect(storage.blobWriteCount()).toBe(3);
    expect(storage.treeWriteCount()).toBe(1);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 0 });
  });

  it('rejects basis construction that would exceed pending-fact budget', async () => {
    const storage = new RecordingCheckpointBasisStorage();
    const pool = new WarpMemoryPool({ name: 'streaming-checkpoint-basis', budget: MemoryBudget.facts(2) });
    const builder = builderFixture(storage, 3, pool);

    await expect(builder.build(facts([
      nodeAlive('task:bounded', 1),
      nodeAlive('task:bounded', 2),
      nodeAlive('task:bounded', 3),
    ]))).rejects.toBeInstanceOf(MemoryBudgetError);
    expect(storage.blobWriteCount()).toBe(0);
    expect(storage.treeWriteCount()).toBe(0);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 1 });
  });

  it('rejects invalid memory thresholds with a typed obstruction', () => {
    expect(() => builderFixture(new RecordingCheckpointBasisStorage(), 0)).toThrow(QueryError);
  });
});

class RecordingCheckpointBasisStorage {
  private readonly _blobOids: string[];
  private readonly _blobWrites: Uint8Array[];
  private readonly _treeOids: string[];

  constructor() {
    this._blobOids = [];
    this._blobWrites = [];
    this._treeOids = [];
  }

  async writeBlob(content: Uint8Array | string): Promise<string> {
    const oid = `blob-${String(this._blobOids.length + 1).padStart(4, '0')}`;
    this._blobOids.push(oid);
    this._blobWrites.push(contentBytes(content));
    return oid;
  }

  async writeTree(_entries: readonly string[]): Promise<string> {
    const oid = `tree-${String(this._treeOids.length + 1).padStart(4, '0')}`;
    this._treeOids.push(oid);
    return oid;
  }

  blobWriteCount(): number {
    return this._blobOids.length;
  }

  treeWriteCount(): number {
    return this._treeOids.length;
  }

  requiredBlob(index: number): Uint8Array {
    const blob = this._blobWrites[index];
    if (blob !== undefined) {
      return blob;
    }
    throw new Error(`missing recorded blob ${index}`);
  }
}

function builderFixture(
  storage: RecordingCheckpointBasisStorage,
  maxFactsPerShard: number,
  pool?: WarpMemoryPool,
): StreamingCheckpointBasisBuilder {
  const options = {
    graphName: 'v18-bounded-memory',
    checkpointSha: 'checkpoint-bounded-memory',
    frontier: new Map([['writer-a', 'patch-0005']]),
    storage,
    maxFactsPerShard,
  };
  if (pool === undefined) {
    return new StreamingCheckpointBasisBuilder(options);
  }
  return new StreamingCheckpointBasisBuilder({
    ...options,
    pool,
  });
}

async function* facts(values: readonly CheckpointBasisFact[]): AsyncIterable<CheckpointBasisFact> {
  for (const value of values) {
    yield value;
  }
}

function nodeAlive(nodeId: string, lamport: number): CheckpointNodeLivenessFact {
  return new CheckpointNodeLivenessFact({ nodeId, alive: true, eventId: event(lamport) });
}

function nodeAliveWithPatch(lamport: number, patchSha: string): CheckpointNodeLivenessFact {
  return new CheckpointNodeLivenessFact({
    nodeId: 'node:streamed',
    alive: true,
    eventId: new EventId(lamport, 'writer-a', patchSha, 0),
  });
}

function event(lamport: number): EventId {
  return new EventId(lamport, 'writer-a', lamport.toString(16).padStart(4, '0'), 0);
}

function decodeChunk(bytes: Uint8Array): readonly CheckpointBasisFactTransport[] {
  return defaultCodec.decode<readonly CheckpointBasisFactTransport[]>(bytes);
}

function eventPatchSha(fact: CheckpointBasisFactTransport): string {
  if ('eventId' in fact) {
    return fact.eventId.patchSha;
  }
  throw new Error('expected event-backed checkpoint basis fact');
}

function contentBytes(content: Uint8Array | string): Uint8Array {
  if (content instanceof Uint8Array) {
    return content;
  }
  return new TextEncoder().encode(content);
}
