import { vi } from 'vitest';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';
import type BundleHandle from '../../../src/domain/storage/BundleHandle.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';
import type { IndexShardDecodeOptions } from '../../../src/ports/IndexStorePort.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';

/** Injects one-shard failures through IndexStorePort. */
export default class V17CheckpointTargetShardFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly root: BundleHandle;
  private readonly path: string;

  constructor(options: {
    readonly graph: OpticFixtureGraph;
    readonly root: BundleHandle;
    readonly path: string;
  }) {
    this.graph = options.graph;
    this.root = options.root;
    this.path = options.path;
    Object.freeze(this);
  }

  makeUnavailable(): void {
    this.replaceTarget(() => {
      throw new PersistenceError(
        `Shard not found: ${this.path}`,
        PersistenceError.E_MISSING_OBJECT,
      );
    });
  }

  makeInvalid(): void {
    this.replaceTarget(() => codec.encode(Object.freeze({ invalid: true })));
  }

  private replaceTarget(replacement: () => Uint8Array): void {
    const store = this.graph._indexStore;
    const targetRoot = this.root;
    const targetPath = this.path;
    const originalDecode = store.decodeShardAt.bind(store);
    vi.spyOn(store, 'decodeShardAt').mockImplementation(async <T extends CodecValue = CodecValue>(
      root: BundleHandle, path: string, options?: IndexShardDecodeOptions,
    ): Promise<T | null> => {
      if (root.equals(targetRoot) && path === targetPath) {
        return codec.decode<T>(replacement());
      }
      return await originalDecode<T>(root, path, options);
    });
  }
}
