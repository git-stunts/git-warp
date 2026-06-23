import { describe, expect, it } from 'vitest';
import ContinuumEvidencePosture from '../../../../../src/domain/continuum/ContinuumEvidencePosture.ts';
import QueryError from '../../../../../src/domain/errors/QueryError.ts';
import TraversalOptic from '../../../../../src/domain/services/optic/TraversalOptic.ts';
import CheckpointTailWitnessLocator from '../../../../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';
import Optic from '../../../../../src/domain/services/optic/Optic.ts';
import OpticAperturePosture from '../../../../../src/domain/services/optic/OpticAperturePosture.ts';
import OpticBasisPosture from '../../../../../src/domain/services/optic/OpticBasisPosture.ts';
import OpticCoordinatePosture from '../../../../../src/domain/services/optic/OpticCoordinatePosture.ts';

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
});

function locator(): CheckpointTailWitnessLocator {
  return Object.create(CheckpointTailWitnessLocator.prototype) as CheckpointTailWitnessLocator;
}
