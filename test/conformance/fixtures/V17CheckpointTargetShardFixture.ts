import { vi } from 'vitest';
import PersistenceError from '../../../src/domain/errors/PersistenceError.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

export default class V17CheckpointTargetShardFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly shardOid: string;

  constructor(options: {
    readonly graph: OpticFixtureGraph;
    readonly shardOid: string;
  }) {
    if (options.shardOid.length === 0) {
      throw new V17CheckpointTailOpticFixtureError('target checkpoint shard oid must be non-empty');
    }

    this.graph = options.graph;
    this.shardOid = options.shardOid;
    Object.freeze(this);
  }

  makeUnavailable(): void {
    const originalReadBlob = this.graph._persistence.readBlob.bind(this.graph._persistence);
    vi.spyOn(this.graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
      if (oid === this.shardOid) {
        throw new PersistenceError(
          `Blob not found: ${oid}`,
          PersistenceError.E_MISSING_OBJECT,
        );
      }

      return await originalReadBlob(oid);
    });
  }

  makeInvalid(): void {
    const originalReadBlob = this.graph._persistence.readBlob.bind(this.graph._persistence);
    vi.spyOn(this.graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
      if (oid === this.shardOid) {
        return this.graph._codec.encode(Object.freeze({ invalid: true }));
      }

      return await originalReadBlob(oid);
    });
  }
}
