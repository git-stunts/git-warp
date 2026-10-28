import CheckpointTailWitnessLocator from './CheckpointTailWitnessLocator.ts';
import ConeWitnessLocator from './ConeWitnessLocator.ts';
import type ConeReadBasisSource from '../cone/ConeReadBasisSource.ts';
import type OpticWitnessLocator from './OpticWitnessLocator.ts';
import ContinuumEvidencePosture from '../../continuum/ContinuumEvidencePosture.ts';
import NeighborhoodOptic from './NeighborhoodOptic.ts';
import NodeOptic from './NodeOptic.ts';
import Optic, { type OpticPostureFields } from './Optic.ts';
import OpticAperturePosture from './OpticAperturePosture.ts';
import OpticBasisPosture from './OpticBasisPosture.ts';
import OpticCoordinatePosture, {
  type OpticCoordinatePostureValue,
} from './OpticCoordinatePosture.ts';
import OpticSupportRule from './OpticSupportRule.ts';
import TraversalOptic from './TraversalOptic.ts';
import type CheckpointTailOpticSource from './CheckpointTailOpticSource.ts';

type CheckpointTailWorldlineOpticOptions = {
  readonly source: CheckpointTailOpticSource;
  readonly coordinatePosture?: OpticCoordinatePosture | OpticCoordinatePostureValue;
};

/** An optic over a lane's cone records (#1039): live, or pinned to a captured coordinate. */
type ConeWorldlineOpticOptions = {
  readonly worldline: string;
  readonly cone: ConeReadBasisSource;
  readonly coordinatePosture: OpticCoordinatePosture;
};

type WorldlineOpticOptions = CheckpointTailWorldlineOpticOptions | ConeWorldlineOpticOptions;

export default class WorldlineOptic {
  private readonly _locator: OpticWitnessLocator;
  private readonly _posture: OpticPostureFields;

  constructor(options: WorldlineOpticOptions) {
    const coordinatePosture = normalizeCoordinatePosture(options.coordinatePosture);
    const cone = 'cone' in options;
    this._locator = 'cone' in options
      ? new ConeWitnessLocator({ worldline: options.worldline, source: options.cone })
      : new CheckpointTailWitnessLocator({
        source: options.source,
        cacheBasis: coordinatePosture.isCapturedCoordinate(),
      });
    this._posture = Object.freeze({
      coordinatePosture,
      aperturePosture: OpticAperturePosture.defaultFullRead(),
      basisPosture: cone ? OpticBasisPosture.coneBasis() : OpticBasisPosture.checkpointTailBasisVerified(),
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
        supportRule: OpticSupportRule.globalDiscoveryRefused(),
      }),
      locator: this._locator,
    });
  }
}

function normalizeCoordinatePosture(
  posture: OpticCoordinatePosture | OpticCoordinatePostureValue | undefined,
): OpticCoordinatePosture {
  return posture instanceof OpticCoordinatePosture
    ? posture
    : new OpticCoordinatePosture(posture ?? OpticCoordinatePosture.liveOneOff().value);
}
