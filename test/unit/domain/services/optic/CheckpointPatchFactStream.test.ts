import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import { Dot } from '../../../../../src/domain/crdt/Dot.ts';
import MemoryBudget from '../../../../../src/domain/memory/MemoryBudget.ts';
import WarpMemoryPool from '../../../../../src/domain/memory/WarpMemoryPool.ts';
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
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import Patch from '../../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../../../src/domain/types/ops/NodePropSet.ts';
import Op from '../../../../../src/domain/types/ops/Op.ts';
import { OP_SCOPE_BOTH } from '../../../../../src/domain/types/ops/OpScope.ts';
import OpApplied from '../../../../../src/domain/types/ops/OpApplied.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';

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

  it('streams bounded facts without full patch-chain residency', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('bbbb', [
      patchEntry({
        sha: 'bbbb',
        writer: 'writer-b',
        lamport: 2,
        ops: [new NodePropSet('node:b', 'title', 'B')],
      }),
      patchEntry({
        sha: 'bbbc',
        writer: 'writer-b',
        lamport: 3,
        ops: [new NodePropSet('node:b', 'status', 'done')],
      }),
    ]);
    const pool = new WarpMemoryPool({
      name: 'patch-fact-stream',
      budget: MemoryBudget.entries(2),
    });
    const stream = new CheckpointPatchFactStream({ source });

    const facts = await collectFacts(stream.streamBounded({
      previousCheckpoint: checkpoint(new Map([['writer-b', 'base-b']])),
      targetFrontier: new Map([['writer-b', 'bbbb']]),
      pool,
    }));

    expect(facts.map((fact) => fact.kind)).toEqual([
      'node-property',
      'provenance',
      'node-property',
      'provenance',
    ]);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 1, rejected: 0 });
  });

  it('streams bounded writer facts in the same global order as the unbounded stream', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('aaaa', [
      patchEntry({
        sha: 'aaaa',
        writer: 'writer-a',
        lamport: 3,
        ops: [new NodeAdd('node:a', new Dot('writer-a', 3))],
      }),
    ]);
    source.setChain('bbbb', [
      patchEntry({
        sha: 'bbbb',
        writer: 'writer-b',
        lamport: 2,
        ops: [new NodePropSet('node:b', 'title', 'B')],
      }),
    ]);
    const stream = new CheckpointPatchFactStream({ source });
    const previousCheckpoint = checkpoint(new Map());
    const targetFrontier = new Map([
      ['writer-a', 'aaaa'],
      ['writer-b', 'bbbb'],
    ]);
    const pool = new WarpMemoryPool({
      name: 'patch-fact-stream-merge',
      budget: MemoryBudget.entries(2),
    });

    const unboundedFacts = await collectFacts(stream.stream({ previousCheckpoint, targetFrontier }));
    const boundedFacts = await collectFacts(stream.streamBounded({ previousCheckpoint, targetFrontier, pool }));

    expect(boundedFacts.map((fact) => fact.sortKey())).toEqual(unboundedFacts.map((fact) => fact.sortKey()));
    expect(boundedFacts.map((fact) => fact.kind)).toEqual([
      'node-property',
      'provenance',
      'node-liveness',
      'provenance',
    ]);
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 0 });
  });

  it('releases bounded writer cursor leases when the consumer closes early', async () => {
    const source = new TestPatchFactStreamSource();
    source.setChain('aaaa', [
      patchEntry({
        sha: 'aaaa',
        writer: 'writer-a',
        lamport: 3,
        ops: [new NodeAdd('node:a', new Dot('writer-a', 3))],
      }),
    ]);
    source.setChain('bbbb', [
      patchEntry({
        sha: 'bbbb',
        writer: 'writer-b',
        lamport: 2,
        ops: [new NodePropSet('node:b', 'title', 'B')],
      }),
    ]);
    const pool = new WarpMemoryPool({
      name: 'patch-fact-stream-close',
      budget: MemoryBudget.entries(2),
    });
    const stream = new CheckpointPatchFactStream({ source });
    const iterator = stream.streamBounded({
      previousCheckpoint: checkpoint(new Map()),
      targetFrontier: new Map([
        ['writer-a', 'aaaa'],
        ['writer-b', 'bbbb'],
      ]),
      pool,
    })[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      value: { kind: 'node-property' },
      done: false,
    });
    expect(pool.snapshot()).toMatchObject({ leased: 2, peak: 2, rejected: 0 });
    await iterator.return?.();
    expect(pool.snapshot()).toMatchObject({ leased: 0, peak: 2, rejected: 0 });
  });

  it('rejects malformed bounded stream options before field access', async () => {
    const stream = new CheckpointPatchFactStream({ source: new TestPatchFactStreamSource() });

    await expect(collectFacts(
      // @ts-expect-error deliberate malformed bounded stream options fixture
      stream.streamBounded(null),
    )).rejects.toMatchObject({
      code: 'E_CHECKPOINT_PATCH_FACT_STREAM',
      context: {
        field: 'options',
        reason: 'invalid-bounded-read-options',
      },
    });
    await expect(collectFacts(
      // @ts-expect-error deliberate malformed bounded stream options fixture
      stream.streamBounded(null),
    )).rejects.toBeInstanceOf(QueryError);
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
  readonly _codec: CodecPort = defaultCodec;
  readonly _checkpointStore = new InMemoryCheckpointStore();
  readonly _indexStore = new MockIndexStorage();
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
