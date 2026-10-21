import { describe, expect, it } from 'vitest';

import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import DotMint from '../../../../src/domain/crdt/DotMint.ts';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import { PatchBuilder } from '../../../../src/domain/services/PatchBuilder.ts';
import EdgeAdd from '../../../../src/domain/types/ops/EdgeAdd.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { createPatchBuilderMockPersistence } from './PatchBuilderTestHarness.ts';

function builder(versionVector: VersionVector, dotMint: DotMint): PatchBuilder {
  return new PatchBuilder({
    persistence: createPatchBuilderMockPersistence(),
    graphName: 'g',
    writerId: 'alice',
    lamport: 1,
    versionVector,
    dotMint,
    getCurrentState: () => null,
  });
}

function addDots(patch: ReturnType<PatchBuilder['build']>): Dot[] {
  return patch.ops.flatMap((op) => op instanceof NodeAdd || op instanceof EdgeAdd ? [op.dot] : []);
}

describe('PatchBuilder dot minting (#1013)', () => {
  it('mints above the chain head even when its version vector is empty', () => {
    const patch = builder(VersionVector.empty(), DotMint.after('alice', 5)).addNode('a').addEdge('a', 'b', 'l').build();

    expect(addDots(patch)).toEqual([new Dot('alice', 6), new Dot('alice', 7)]);
    expect(patch.context).toEqual({ alice: 7 });
  });

  it('never re-mints a counter its version vector already records', () => {
    const patch = builder(VersionVector.from({ alice: 9, bob: 2 }), DotMint.after('alice', 0)).addNode('a').build();

    expect(addDots(patch)).toEqual([new Dot('alice', 10)]);
    expect(patch.context).toEqual({ alice: 10, bob: 2 });
  });

  it('refuses a mint that belongs to another writer', () => {
    expect(() => builder(VersionVector.empty(), DotMint.after('bob', 0)))
      .toThrow(expect.objectContaining({ code: 'E_CRDT_DOT_MINT_WRITER' }));
  });

  it('allocates auto-named entities from the same mint', () => {
    const patch = builder(VersionVector.empty(), DotMint.after('alice', 3))
      .addNode('a').addEntityAuto('entry', { text: 'x' }).build();

    expect(addDots(patch)).toEqual([new Dot('alice', 4), new Dot('alice', 5)]);
  });
});
