import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import CheckpointPatchFactStream from '../../../../../src/domain/services/optic/CheckpointPatchFactStream.ts';
import {
  CheckpointBasisFact,
  CheckpointNodeLivenessFact,
  CheckpointNodePropertyFact,
  CheckpointProvenanceFact,
} from '../../../../../src/domain/services/optic/CheckpointBasisFact.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../../../src/domain/services/codec/WarpMessageCodec.ts';
import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import Op from '../../../../../src/domain/types/ops/Op.ts';
import { OP_SCOPE_BOTH } from '../../../../../src/domain/types/ops/OpScope.ts';
import OpApplied from '../../../../../src/domain/types/ops/OpApplied.ts';
import InMemoryGraphAdapter from '../../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import type BlobStoragePort from '../../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';

const REPO_ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const STREAM_SOURCE = 'src/domain/services/optic/CheckpointPatchFactStream.ts';

describe('CheckpointPatchFactStream', () => {
  it('streams deterministic facts from target frontier back to previous checkpoint coverage', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('bbbb', [
      patchEntry({
        sha: 'bbbb',
        writer: 'writer-b',
        lamport: 2,
        ops: [new NodePropSet('node:b', 'title', 'B')],
      }),
    ]);
    source.setChain('aaaa', [
      patchEntry({
        sha: 'aaaa',
        writer: 'writer-a',
        lamport: 1,
        ops: [new NodeAdd('node:a', new Dot('writer-a', 1))],
      }),
    ]);
    const stream = new CheckpointPatchFactStream({ source });

    const facts = await collectFacts(stream.stream({
      previousCheckpoint: checkpoint(new Map([['writer-a', 'base-a']])),
      targetFrontier: new Map([
        ['writer-b', 'bbbb'],
        ['writer-a', 'aaaa'],
      ]),
    }));

    expect(source.loadCalls).toEqual([
      { tipSha: 'aaaa', stopAtSha: 'base-a' },
      { tipSha: 'bbbb', stopAtSha: null },
    ]);
    expect(source.validationCalls).toEqual([
      { writerId: 'writer-a', incomingSha: 'aaaa' },
      { writerId: 'writer-b', incomingSha: 'bbbb' },
    ]);
    expect(facts.map((fact) => fact.kind)).toEqual([
      'node-liveness',
      'provenance',
      'node-property',
      'provenance',
    ]);
    expect(facts[0]).toBeInstanceOf(CheckpointNodeLivenessFact);
    expect(facts[2]).toBeInstanceOf(CheckpointNodePropertyFact);
    expect(facts[3]).toBeInstanceOf(CheckpointProvenanceFact);
  });

  it('turns previous checkpoint coverage failure into a typed obstruction', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('aaaa', [
      patchEntry({
        sha: 'aaaa',
        writer: 'writer-a',
        lamport: 1,
        ops: [new NodeAdd('node:a', new Dot('writer-a', 1))],
      }),
    ]);
    source.failValidation = true;
    const stream = new CheckpointPatchFactStream({ source });

    await expect(collectFacts(stream.stream({
      previousCheckpoint: checkpoint(new Map([['writer-a', 'base-a']])),
      targetFrontier: new Map([['writer-a', 'aaaa']]),
    }))).rejects.toMatchObject({
      code: 'E_CHECKPOINT_PATCH_FACT_STREAM',
      context: {
        field: 'previousCheckpoint',
        reason: 'checkpoint-coverage-obstructed',
      },
    });
  });

  it('turns malformed patch operations into a typed obstruction', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('aaaa', [
      patchEntry({
        sha: 'aaaa',
        writer: 'writer-a',
        lamport: 1,
        ops: [new NodePropSet('node:a', 'bad', new InvalidPropertyCarrier())],
      }),
    ]);
    const stream = new CheckpointPatchFactStream({ source });

    await expect(collectFacts(stream.stream({
      previousCheckpoint: checkpoint(new Map([['writer-a', 'base-a']])),
      targetFrontier: new Map([['writer-a', 'aaaa']]),
    }))).rejects.toMatchObject({
      code: 'E_CHECKPOINT_PATCH_FACT_STREAM',
      context: {
        field: 'patch.ops',
        reason: 'malformed-patch',
      },
    });
  });

  it('preserves unsupported operation obstructions', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('aaaa', [
      patchEntry({
        sha: 'aaaa',
        writer: 'writer-a',
        lamport: 1,
        ops: [
          // @ts-expect-error deliberate unsupported operation fixture for the obstruction boundary
          new UnsupportedPatchOperation(),
        ],
      }),
    ]);
    const stream = new CheckpointPatchFactStream({ source });

    await expect(collectFacts(stream.stream({
      previousCheckpoint: checkpoint(new Map([['writer-a', 'base-a']])),
      targetFrontier: new Map([['writer-a', 'aaaa']]),
    }))).rejects.toMatchObject({
      code: 'E_CHECKPOINT_PATCH_FACT_STREAM',
      context: {
        field: 'patch.ops',
        reason: 'unsupported-operation',
      },
    });
  });

  it('keeps the patch fact stream source off full-read operations', () => {
    const source = readFileSync(`${REPO_ROOT}${STREAM_SOURCE}`, 'utf8');

    expect(source).not.toContain('WarpState');
    expect(source).not.toContain('materialize(');
    expect(source).not.toContain('_materializeGraph');
    expect(source).not.toContain('getStateSnapshot');
    expect(source).not.toContain('getNodes');
    expect(source).not.toContain('getEdges');
  });
});

class TestPatchFactStreamSource extends CheckpointTailOpticSource {
  readonly graphName = 'patch-fact-stream-test';
  readonly _persistence: CorePersistence = new InMemoryGraphAdapter();
  readonly _codec: CodecPort = defaultCodec;
  readonly _blobStorage: BlobStoragePort | null = null;
  readonly _commitMessageCodec: CommitMessageCodecPort = DEFAULT_COMMIT_MESSAGE_CODEC;
  readonly loadCalls: Array<{ readonly tipSha: string; readonly stopAtSha: string | null }> = [];
  readonly validationCalls: Array<{ readonly writerId: string; readonly incomingSha: string }> = [];
  private readonly _chains: Map<string, readonly CheckpointTailPatchEntry[]> = new Map();
  failValidation = false;

  discoverWriters(): Promise<string[]> {
    return Promise.resolve(['writer-a', 'writer-b']);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve('checkpoint-sha');
  }

  _loadPatchChainFromSha(
    tipSha: string,
    stopAtSha: string | null = null,
  ): Promise<CheckpointTailPatchEntry[]> {
    this.loadCalls.push({ tipSha, stopAtSha });
    return Promise.resolve([...(this._chains.get(tipSha) ?? [])]);
  }

  _loadWriterPatches(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _validatePatchAgainstCheckpoint(
    writerId: string,
    incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    this.validationCalls.push({ writerId, incomingSha });
    if (this.failValidation) {
      return Promise.reject(new QueryError('coverage failure', {
        code: 'E_TEST_COVERAGE',
        context: { writerId, incomingSha },
      }));
    }
    return Promise.resolve();
  }

  setChain(tipSha: string, entries: readonly CheckpointTailPatchEntry[]): void {
    this._chains.set(tipSha, Object.freeze([...entries]));
  }
}

class InvalidPropertyCarrier {
  readonly invalid = true;
}

class UnsupportedPatchOperation extends Op<'UnsupportedPatchOperation'> {
  readonly receiptName = 'UnsupportedPatchOperation';

  constructor() {
    super('UnsupportedPatchOperation', OP_SCOPE_BOTH);
    Object.freeze(this);
  }

  validate(): void {}
  mutate(): void {}
  outcome(): OpApplied {
    return new OpApplied('unsupported');
  }
  snapshot(): object {
    return Object.freeze({});
  }
  accumulate(): void {}
}

function checkpoint(frontier: Map<string, string>): CheckpointTailCheckpointFrontier {
  return Object.freeze({ schema: 5, frontier });
}

function patchEntry(options: {
  readonly sha: string;
  readonly writer: string;
  readonly lamport: number;
  readonly ops: Patch['ops'];
}): CheckpointTailPatchEntry {
  return Object.freeze({
    sha: options.sha,
    patch: new Patch({
      schema: 3,
      writer: options.writer,
      lamport: options.lamport,
      context: {},
      ops: options.ops,
    }),
  });
}

async function collectFacts(stream: AsyncIterable<CheckpointBasisFact>): Promise<CheckpointBasisFact[]> {
  const facts: CheckpointBasisFact[] = [];
  for await (const fact of stream) {
    facts.push(fact);
  }
  return facts;
}
