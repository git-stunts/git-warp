import { describe, expect, it } from 'vitest';
import defaultCodec from '../../../../../src/infrastructure/codecs/CborCodec.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import CheckpointTailWitnessLocator from '../../../../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import NeighborhoodOptic from '../../../../../src/domain/services/optic/NeighborhoodOptic.ts';
import NodeOptic from '../../../../../src/domain/services/optic/NodeOptic.ts';
import NodePropertyOptic from '../../../../../src/domain/services/optic/NodePropertyOptic.ts';
import Optic from '../../../../../src/domain/services/optic/Optic.ts';
import OpticCoordinatePosture from '../../../../../src/domain/services/optic/OpticCoordinatePosture.ts';
import WorldlineOptic from '../../../../../src/domain/services/optic/WorldlineOptic.ts';
import InMemoryCheckpointStore from '../../../../helpers/InMemoryCheckpointStore.ts';
import MockIndexStorage from '../../../../helpers/MockIndexStorage.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = 'worldline-optic-reification';
  readonly _codec: CodecPort = defaultCodec;
  readonly _checkpointStore = new InMemoryCheckpointStore();
  readonly _indexStore = new MockIndexStorage();

  discoverWriters(): Promise<string[]> {
    return Promise.resolve([]);
  }

  _readCheckpointSha(): Promise<string | null> {
    return Promise.resolve(null);
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

describe('WorldlineOptic', () => {
  it('lowers node and property scopes into reified Optic nouns', () => {
    const worldlineOptic = new WorldlineOptic({
      source: new TestCheckpointTailOpticSource(),
      coordinatePosture: OpticCoordinatePosture.capturedCoordinate(),
    });

    const nodeScope = worldlineOptic.node('node:alpha');
    const propertyScope = nodeScope.prop('role');

    expect(nodeScope.toOptic()).toBeInstanceOf(Optic);
    expect(nodeScope.toOptic().toContextValue()).toMatchObject({
      opticKind: 'node',
      target: { nodeId: 'node:alpha' },
      coordinatePosture: 'captured-coordinate',
      supportRule: 'exact-entity',
    });
    expect(propertyScope.toOptic().toContextValue()).toMatchObject({
      opticKind: 'node-property',
      target: { nodeId: 'node:alpha', propertyKey: 'role' },
      coordinatePosture: 'captured-coordinate',
      supportRule: 'exact-entity',
    });
  });

  it('lowers neighborhood and traversal scopes with bounded-support posture', () => {
    const worldlineOptic = new WorldlineOptic({
      source: new TestCheckpointTailOpticSource(),
    });

    const neighborhoodScope = worldlineOptic.neighborhood('node:hub');
    const traversalScope = worldlineOptic.traversal('node:hub');

    expect(neighborhoodScope.toOptic().toContextValue()).toMatchObject({
      opticKind: 'neighborhood',
      target: { nodeId: 'node:hub' },
      coordinatePosture: 'live-one-off',
      supportRule: 'neighborhood',
    });
    expect(traversalScope.toOptic().toContextValue()).toMatchObject({
      opticKind: 'traversal',
      target: { nodeId: 'node:hub' },
      supportRule: 'global-discovery-refused',
    });
    expect(traversalScope.toOptic({
      maxDepth: 1,
      maxNodes: 1,
      maxEdges: 1,
    }).toContextValue()).toMatchObject({
      opticKind: 'traversal',
      target: { nodeId: 'node:hub' },
      supportRule: 'traversal-window',
    });
  });

  it('rejects mismatched reified Optic kinds at scope construction', () => {
    const source = new TestCheckpointTailOpticSource();
    const locator = new CheckpointTailWitnessLocator({ source });
    const worldlineOptic = new WorldlineOptic({ source });
    const nodeOptic = worldlineOptic.node('node:alpha').toOptic();
    const propertyOptic = worldlineOptic.node('node:alpha').prop('role').toOptic();
    const neighborhoodOptic = worldlineOptic.neighborhood('node:alpha').toOptic();

    expect(() => new NodeOptic({
      optic: neighborhoodOptic,
      locator,
    })).toThrow(QueryError);
    expect(() => new NodePropertyOptic({
      optic: nodeOptic,
      locator,
    })).toThrow(QueryError);
    expect(() => new NeighborhoodOptic({
      optic: propertyOptic,
      locator,
    })).toThrow(QueryError);
  });
});
