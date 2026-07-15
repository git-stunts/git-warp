import { vi } from 'vitest';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';
import type AssetHandle from '../../../src/domain/storage/AssetHandle.ts';
import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';

/** Injects one-shard failures through IndexStorePort. */
export default class V17CheckpointTargetShardFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly shardHandle: AssetHandle;

  constructor(options: {
    readonly graph: OpticFixtureGraph;
    readonly shardOid: AssetHandle;
  }) {
    this.graph = options.graph;
    this.shardHandle = options.shardOid;
    Object.freeze(this);
  }

  makeUnavailable(): void {
    const store = this.graph._indexStore;
    const originalDecode = store.decodeShard.bind(store);
    vi.spyOn(store, 'decodeShard').mockImplementation(async <
      TDecoded extends CodecValue = CodecValue,
    >(handle: AssetHandle): Promise<TDecoded> => {
      if (handle.equals(this.shardHandle)) {
        throw new PersistenceError(
          `Shard not found: ${handle.toString()}`,
          PersistenceError.E_MISSING_OBJECT,
        );
      }
      return await originalDecode<TDecoded>(handle);
    });
  }

  makeInvalid(): void {
    const store = this.graph._indexStore;
    const originalDecode = store.decodeShard.bind(store);
    vi.spyOn(store, 'decodeShard').mockImplementation(async <
      TDecoded extends CodecValue = CodecValue,
    >(handle: AssetHandle): Promise<TDecoded> => {
      if (handle.equals(this.shardHandle)) {
        return Object.freeze({ invalid: true }) as unknown as TDecoded;
      }
      return await originalDecode<TDecoded>(handle);
    });
  }
}
