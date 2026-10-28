import CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import ContinuumEvidencePosture from '../../continuum/ContinuumEvidencePosture.ts';
import LocatedOptic from './LocatedOptic.ts';
import OpticAperturePosture from './OpticAperturePosture.ts';
import OpticBasisPosture from './OpticBasisPosture.ts';
import OpticCoordinatePosture, { type OpticCoordinatePostureValue } from './OpticCoordinatePosture.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

type CheckpointTailOpticOptions = {
  readonly source: CheckpointTailOpticSource;
  readonly coordinatePosture?: OpticCoordinatePosture | OpticCoordinatePostureValue;
};

/**
 * Maintenance-only optic over a whole-state checkpoint plus its tail. The
 * deprecated graph projection (`ProjectionHandle.optic()`), the internal
 * exact-id query read model and intent guard reads use it; no Runtime, Lane
 * or advanced entry point constructs it (#1039). Public reads use
 * `WorldlineOptic` over cone records.
 */
export default class CheckpointTailOptic extends LocatedOptic {
  constructor(options: CheckpointTailOpticOptions) {
    const coordinatePosture = normalizeCoordinatePosture(options.coordinatePosture);
    super(new CheckpointTailWitnessLocator({
      source: options.source,
      cacheBasis: coordinatePosture.isCapturedCoordinate(),
    }), {
      coordinatePosture,
      aperturePosture: OpticAperturePosture.defaultFullRead(),
      basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
      evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    });
    Object.freeze(this);
  }
}

function normalizeCoordinatePosture(
  posture: OpticCoordinatePosture | OpticCoordinatePostureValue | undefined,
): OpticCoordinatePosture {
  return posture instanceof OpticCoordinatePosture
    ? posture
    : new OpticCoordinatePosture(posture ?? OpticCoordinatePosture.liveOneOff().value);
}
