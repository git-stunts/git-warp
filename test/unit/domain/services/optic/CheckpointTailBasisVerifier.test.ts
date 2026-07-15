import { describe, expect, it } from 'vitest';

import CheckpointTailBasisVerifier from '../../../../../src/domain/services/optic/CheckpointTailBasisVerifier.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import { CURRENT_CHECKPOINT_SCHEMA } from '../../../../../src/domain/services/state/checkpointHelpers.ts';
import AssetHandle from '../../../../../src/domain/storage/AssetHandle.ts';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import type {
  CheckpointBasis,
  CheckpointData,
} from '../../../../../src/ports/CheckpointStorePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';

const GRAPH_NAME = 'checkpoint-tail-basis-verifier';
const CHECKPOINT_SHA = '1'.repeat(40);

class BasisCheckpointStore extends InMemoryCheckpointStore {
  readonly loadBasisCalls: string[] = [];
  readonly loadCheckpointCalls: string[] = [];
  private readonly _result: CheckpointBasis | Error;

  constructor(result: CheckpointBasis | Error) {
    super();
    this._result = result;
  }

  override async loadBasis(checkpointSha: string): Promise<CheckpointBasis> {
    this.loadBasisCalls.push(checkpointSha);
    if (this._result instanceof Error) {
      throw this._result;
    }
    return this._result;
  }

  override async loadCheckpoint(checkpointSha: string): Promise<CheckpointData> {
    this.loadCheckpointCalls.push(checkpointSha);
    throw new Error('basis verification must not load checkpoint state');
  }
}

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = GRAPH_NAME;
  readonly _codec: CodecPort = defaultCodec;
  readonly _indexStore = new MockIndexStorage();
  readonly _checkpointStore: BasisCheckpointStore;
  private readonly _checkpointSha: string | null;

  constructor(options: {
    readonly checkpointSha?: string | null;
    readonly result: CheckpointBasis | Error;
  }) {
    super();
    this._checkpointSha = options.checkpointSha === undefined ? CHECKPOINT_SHA : options.checkpointSha;
    this._checkpointStore = new BasisCheckpointStore(options.result);
  }

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(this._checkpointSha);
  }

  _loadPatchChainFromSha(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _loadWriterPatches(): Promise<CheckpointTailPatchEntry[]> {
    return Promise.resolve([]);
  }

  _validatePatchAgainstCheckpoint(
    _writerId: string,
    _incomingSha: string,
    _checkpoint: CheckpointTailCheckpointFrontier | null | undefined,
  ): Promise<void> {
    return Promise.resolve();
  }
}

describe('CheckpointTailBasisVerifier', () => {
  it('verifies bounded support through loadBasis without loading state or shards', async () => {
    const source = new TestCheckpointTailOpticSource({ result: validBasis() });

    await expect(new CheckpointTailBasisVerifier({ source }).verify()).resolves.toEqual({
      checkpointSha: CHECKPOINT_SHA,
    });

    expect(source._checkpointStore.loadBasisCalls).toEqual([CHECKPOINT_SHA]);
    expect(source._checkpointStore.loadCheckpointCalls).toEqual([]);
    expect(source._indexStore.openedShardHandles).toEqual([]);
    expect(source._indexStore.decodedShardHandles).toEqual([]);
  });

  it('fails closed when no checkpoint is published', async () => {
    const source = new TestCheckpointTailOpticSource({
      checkpointSha: null,
      result: validBasis(),
    });

    await expect(new CheckpointTailBasisVerifier({ source }).verify()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { graphName: GRAPH_NAME, reason: 'missing-checkpoint' },
    });
    expect(source._checkpointStore.loadBasisCalls).toEqual([]);
  });

  it('fails closed for a checkpoint from an obsolete schema', async () => {
    const source = new TestCheckpointTailOpticSource({
      result: validBasis({ schema: CURRENT_CHECKPOINT_SCHEMA - 1 }),
    });

    await expect(new CheckpointTailBasisVerifier({ source }).verify()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { graphName: GRAPH_NAME, reason: 'checkpoint-without-index-tree' },
    });
  });

  it('fails closed when the checkpoint basis has no index shards', async () => {
    const source = new TestCheckpointTailOpticSource({
      result: validBasis({ indexShardHandles: Object.freeze({}) }),
    });

    await expect(new CheckpointTailBasisVerifier({ source }).verify()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { graphName: GRAPH_NAME, reason: 'checkpoint-missing-index-shards' },
    });
  });

  it('maps checkpoint-store failures to unavailable bounded support', async () => {
    const source = new TestCheckpointTailOpticSource({
      result: new Error('checkpoint publication is unavailable'),
    });

    await expect(new CheckpointTailBasisVerifier({ source }).verify()).rejects.toMatchObject({
      code: 'E_OPTIC_NO_BOUNDED_BASIS',
      context: { graphName: GRAPH_NAME, reason: 'checkpoint-basis-unavailable' },
    });
  });
});

function validBasis(overrides: Partial<CheckpointBasis> = {}): CheckpointBasis {
  return {
    checkpointSha: CHECKPOINT_SHA,
    stateHash: '2'.repeat(64),
    schema: CURRENT_CHECKPOINT_SCHEMA,
    frontier: new Map([['writer-a', '3'.repeat(40)]]),
    indexShardHandles: Object.freeze({
      'meta_00.cbor': new AssetHandle('checkpoint-index:meta-00'),
    }),
    ...overrides,
  };
}
