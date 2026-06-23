import CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import ContinuumEvidencePosture from '../../continuum/ContinuumEvidencePosture.ts';
import NeighborhoodOptic from './NeighborhoodOptic.ts';
import NodeOptic from './NodeOptic.ts';
import Optic, { type OpticPostureFields } from './Optic.ts';
import OpticAperturePosture from './OpticAperturePosture.ts';
import OpticBasisPosture from './OpticBasisPosture.ts';
import OpticCoordinatePosture, {
  type OpticCoordinatePostureValue,
} from './OpticCoordinatePosture.ts';
import TraversalOptic from './TraversalOptic.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

type WorldlineOpticOptions = {
  readonly source: CheckpointTailOpticSource;
  readonly coordinatePosture?: OpticCoordinatePosture | OpticCoordinatePostureValue;
};

export default class WorldlineOptic {
  private readonly _locator: CheckpointTailWitnessLocator;
  private readonly _posture: OpticPostureFields;

  constructor(options: WorldlineOpticOptions) {
    this._locator = new CheckpointTailWitnessLocator({ source: options.source });
    this._posture = Object.freeze({
      coordinatePosture: options.coordinatePosture ?? OpticCoordinatePosture.liveOneOff(),
      aperturePosture: OpticAperturePosture.defaultFullRead(),
      basisPosture: OpticBasisPosture.checkpointTailBasisVerified(),
      evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    });
    Object.freeze(this);
  }

  node(nodeId: string): NodeOptic {
    return new NodeOptic({
      optic: Optic.node({ ...this._posture, nodeId }),
      locator: this._locator,
    });
  }

  neighborhood(nodeId: string): NeighborhoodOptic {
    return new NeighborhoodOptic({
      optic: Optic.neighborhood({ ...this._posture, nodeId }),
      locator: this._locator,
    });
  }

  traversal(startNodeId: string): TraversalOptic {
    return new TraversalOptic({
      optic: Optic.traversal({
        ...this._posture,
        startNodeId,
        supportRule: 'global-discovery-refused',
      }),
      locator: this._locator,
    });
  }
}
