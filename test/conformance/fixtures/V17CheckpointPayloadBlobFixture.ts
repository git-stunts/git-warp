import { vi } from 'vitest';
import { textEncode } from '../../../src/domain/utils/bytes.ts';
import type { OpticFixtureGraph } from './V17CheckpointTailOpticGraphFixture.ts';
import V17CheckpointTailOpticFixtureError from './V17CheckpointTailOpticFixtureError.ts';

const EMPTY_CAS_POINTER = 'git-warp:cas-pointer:v1:';

export default class V17CheckpointPayloadBlobFixture {
  private readonly graph: OpticFixtureGraph;
  private readonly payloadOid: string;

  constructor(options: {
    readonly graph: OpticFixtureGraph;
    readonly payloadOid: string;
  }) {
    if (options.payloadOid.length === 0) {
      throw new V17CheckpointTailOpticFixtureError('checkpoint payload oid must be non-empty');
    }

    this.graph = options.graph;
    this.payloadOid = options.payloadOid;
    Object.freeze(this);
  }

  makeEmptyCasPointer(): void {
    const originalReadBlob = this.graph._persistence.readBlob.bind(this.graph._persistence);
    vi.spyOn(this.graph._persistence, 'readBlob').mockImplementation(async (oid: string) => {
      if (oid === this.payloadOid) {
        return textEncode(EMPTY_CAS_POINTER);
      }

      return await originalReadBlob(oid);
    });
  }
}
