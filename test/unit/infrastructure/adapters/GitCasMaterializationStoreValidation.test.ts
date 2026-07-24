import { describe, expect, it } from 'vitest';

import MaterializationCoordinate from '../../../../src/domain/materialization/MaterializationCoordinate.ts';
import MaterializationRoot from '../../../../src/domain/materialization/MaterializationRoot.ts';
import MaterializationRoots from '../../../../src/domain/materialization/MaterializationRoots.ts';
import { createEmptyState } from '../../../../src/domain/services/JoinReducer.ts';
import BundleHandle from '../../../../src/domain/storage/BundleHandle.ts';
import { requireRetainRequest } from '../../../../src/infrastructure/adapters/GitCasMaterializationStoreValidation.ts';

const coordinate = new MaterializationCoordinate({
  frontier: new Map([['writer', 'patch']]),
  ceiling: null,
});

describe('GitCasMaterializationStoreValidation', () => {
  it('accepts a partial liveness materialization without a state hash', () => {
    expect(() => requireRetainRequest({
      coordinate,
      roots: rootsWith({
        nodeAlive: MaterializationRoot.retained(new BundleHandle('node-root')),
      }),
      stateHash: null,
    })).not.toThrow();
  });

  it('rejects a materialization that cannot answer any read', () => {
    expect(() => requireRetainRequest({
      coordinate,
      roots: rootsWith({}),
      stateHash: null,
    })).toThrowError(/at least one materialization root/u);
  });

  it('rejects a partial handle that claims a whole-state replay basis', () => {
    expect(() => requireRetainRequest({
      coordinate,
      roots: rootsWith({
        replayBasis: MaterializationRoot.retained(new BundleHandle('basis-root')),
      }),
      stateHash: null,
    })).toThrowError(/cannot retain a whole-state replay basis/u);
  });

  it('accepts a complete materialization with a replay basis to stage', () => {
    expect(() => requireRetainRequest({
      coordinate,
      roots: rootsWith({
        nodeAlive: MaterializationRoot.retained(new BundleHandle('node-root')),
      }),
      replayBasis: createEmptyState(),
      stateHash: 'state-hash',
    })).not.toThrow();
  });

  it('accepts a complete materialization with an already retained replay basis', () => {
    expect(() => requireRetainRequest({
      coordinate,
      roots: rootsWith({
        replayBasis: MaterializationRoot.retained(new BundleHandle('basis-root')),
      }),
      stateHash: 'state-hash',
    })).not.toThrow();
  });

  it('rejects a complete materialization without any replay basis', () => {
    expect(() => requireRetainRequest({
      coordinate,
      roots: rootsWith({
        nodeAlive: MaterializationRoot.retained(new BundleHandle('node-root')),
      }),
      stateHash: 'state-hash',
    })).toThrowError(/requires a whole-state replay basis/u);
  });
});

function rootsWith(overrides: {
  readonly nodeAlive?: MaterializationRoot;
  readonly replayBasis?: MaterializationRoot;
}): MaterializationRoots {
  return new MaterializationRoots({
    adjacency: MaterializationRoot.unavailable(),
    edgeAlive: MaterializationRoot.unavailable(),
    edgeBirths: MaterializationRoot.unavailable(),
    frontier: MaterializationRoot.unavailable(),
    nodeAlive: overrides.nodeAlive ?? MaterializationRoot.unavailable(),
    properties: MaterializationRoot.unavailable(),
    provenanceSupport: MaterializationRoot.unavailable(),
    replayBasis: overrides.replayBasis ?? MaterializationRoot.unavailable(),
    roaringIndexes: MaterializationRoot.unavailable(),
  });
}
