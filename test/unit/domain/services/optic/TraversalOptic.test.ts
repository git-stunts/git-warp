import { describe, expect, it } from 'vitest';
import ContinuumEvidencePosture from '../../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import TraversalOptic from '../../../../../src/domain/services/optic/TraversalOptic.ts';
import CheckpointTailWitnessLocator from '../../../../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';
import CheckpointTailOpticSource, {
  type CheckpointTailCheckpointFrontier,
  type CheckpointTailPatchEntry,
} from '../../../../../src/domain/services/optic/CheckpointTailOpticSource.ts';
import Optic from '../../../../../src/domain/services/optic/Optic.ts';
import OpticAperturePosture from '../../../../../src/domain/services/optic/OpticAperturePosture.ts';
import OpticBasisPosture from '../../../../../src/domain/services/optic/OpticBasisPosture.ts';
import OpticCoordinatePosture from '../../../../../src/domain/services/optic/OpticCoordinatePosture.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from '../../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import defaultCodec from '../../../../../src/domain/utils/defaultCodec.ts';
import InMemoryGraphAdapter from '../../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import type { CorePersistence } from '../../../../../src/domain/types/WarpPersistence.ts';
import type BlobStoragePort from '../../../../../src/ports/BlobStoragePort.ts';
import type CodecPort from '../../../../../src/ports/CodecPort.ts';
import type CommitMessageCodecPort from '../../../../../src/ports/CommitMessageCodecPort.ts';

describe('TraversalOptic', () => {
  it('rejects an empty start node id at construction', () => {
    expect(() => new TraversalOptic({
      optic: Optic.traversal({
        startNodeId: '',
        coordinatePosture: OpticCoordinatePosture.liveOneOff(),
        aperturePosture: OpticAperturePosture.defaultFullRead(),
        basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
        evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
        supportRule: 'global-discovery-refused',
      }),
      locator: locator(),
    })).toThrow(QueryError);
  });

  it('rejects direct traversal execution when the Optic refuses bounded support', async () => {
    const readLocator = new CheckpointTailWitnessLocator({
      source: new TestCheckpointTailOpticSource(),
    });

    await expect(readLocator.readTraversal(traversalOptic('global-discovery-refused'), {
      maxDepth: 1,
      maxNodes: 1,
      maxEdges: 1,
    })).rejects.toMatchObject({
      code: 'E_OPTIC_SCHEMA',
      context: {
        reason: 'requires-global-scan',
      },
    });
  });
});

function locator(): CheckpointTailWitnessLocator {
  return new CheckpointTailWitnessLocator({
    source: new TestCheckpointTailOpticSource(),
  });
}

function traversalOptic(supportRule: 'global-discovery-refused' | 'traversal-window'): Optic {
  return Optic.traversal({
    startNodeId: 'node:alpha',
    coordinatePosture: OpticCoordinatePosture.liveOneOff(),
    aperturePosture: OpticAperturePosture.defaultFullRead(),
    basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
    evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    supportRule,
  });
}

class TestCheckpointTailOpticSource extends CheckpointTailOpticSource {
  readonly graphName = 'traversal-optic-support-rule';
  readonly _persistence: CorePersistence = new InMemoryGraphAdapter();
  readonly _codec: CodecPort = defaultCodec;
  readonly _blobStorage: BlobStoragePort | null = null;
  readonly _commitMessageCodec: CommitMessageCodecPort = DEFAULT_COMMIT_MESSAGE_CODEC;

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
