import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import {
  CheckpointNodeLivenessFact,
  type CheckpointBasisFact,
  type CheckpointBasisFactTransport,
} from '../../../../../src/domain/services/optic/CheckpointBasisFact.ts';
import StreamingCheckpointBasisBuilder from '../../../../../src/domain/services/optic/StreamingCheckpointBasisBuilder.ts';
import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const BUILDER_SOURCE = 'src/domain/services/optic/StreamingCheckpointBasisBuilder.ts';

describe('StreamingCheckpointBasisBuilder', () => {
  it('flushes bounded fact shards to storage and emits a manifest', async () => {
    const storage = new RecordingBasisStorage();
    const builder = new StreamingCheckpointBasisBuilder({
      graphName: 'streaming-checkpoint-basis-builder-test',
      checkpointSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      frontier: new Map([['writer-a', 'patch-a']]),
      storage,
      maxFactsPerShard: 2,
    });

    const result = await builder.build(factStream([
      livenessFact({ lamport: 2, patchSha: 'bbbb' }),
      livenessFact({ lamport: 1, patchSha: 'aaaa' }),
      livenessFact({ lamport: 3, patchSha: 'cccc' }),
      livenessFact({ lamport: 4, patchSha: 'dddd' }),
      livenessFact({ lamport: 5, patchSha: 'eeee' }),
    ]));

    expect(result.flushCount).toBe(3);
    expect(result.shardWriteCount).toBe(3);
    expect(storage.blobWrites).toHaveLength(3);
    expect(storage.treeWrites).toHaveLength(1);
    expect(result.rootTreeOid).toBe('tree-000001');
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

  it('keeps the builder source off full-state and materialization inputs', () => {
    const source = readFileSync(`${REPO_ROOT}${BUILDER_SOURCE}`, 'utf8');

    expect(source).not.toContain('WarpState');
    expect(source).not.toContain('materialize(');
    expect(source).not.toContain('_materializeGraph');
    expect(source).not.toContain('getStateSnapshot');
  });

  it('rejects invalid memory thresholds with a typed obstruction', () => {
    expect(() => new StreamingCheckpointBasisBuilder({
      graphName: 'streaming-checkpoint-basis-builder-test',
      checkpointSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      frontier: new Map([['writer-a', 'patch-a']]),
      storage: new RecordingBasisStorage(),
      maxFactsPerShard: 0,
    })).toThrow(QueryError);
  });
});

class RecordingBasisStorage {
  readonly blobWrites: Uint8Array[] = [];
  readonly treeWrites: Array<readonly string[]> = [];

  writeBlob(content: Uint8Array | string): Promise<string> {
    const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content;
    this.blobWrites.push(bytes);
    return Promise.resolve(`blob-${String(this.blobWrites.length).padStart(6, '0')}`);
  }

  writeTree(entries: string[]): Promise<string> {
    this.treeWrites.push(Object.freeze([...entries]));
    return Promise.resolve(`tree-${String(this.treeWrites.length).padStart(6, '0')}`);
  }

  requiredBlob(index: number): Uint8Array {
    const blob = this.blobWrites[index];
    if (blob === undefined) {
      throw new Error(`missing recorded blob ${index}`);
    }
    return blob;
  }
}

async function* factStream(facts: readonly CheckpointBasisFact[]): AsyncIterable<CheckpointBasisFact> {
  for (const fact of facts) {
    yield fact;
  }
}

function livenessFact(options: {
  readonly lamport: number;
  readonly patchSha: string;
}): CheckpointNodeLivenessFact {
  return new CheckpointNodeLivenessFact({
    nodeId: 'node:streamed',
    alive: true,
    eventId: new EventId(options.lamport, 'writer-a', options.patchSha, 0),
  });
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
