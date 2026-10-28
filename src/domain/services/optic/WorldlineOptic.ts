import ConeWitnessLocator from './ConeWitnessLocator.ts';
import type ConeReadBasisSource from '../cone/ConeReadBasisSource.ts';
import ContinuumEvidencePosture from '../../continuum/ContinuumEvidencePosture.ts';
import LocatedOptic from './LocatedOptic.ts';
import OpticAperturePosture from './OpticAperturePosture.ts';
import OpticBasisPosture from './OpticBasisPosture.ts';
import type OpticCoordinatePosture from './OpticCoordinatePosture.ts';

/** An optic over a Lane's cone records (#1039): live, or pinned to a captured coordinate. */
type WorldlineOpticOptions = {
  readonly worldline: string;
  readonly cone: ConeReadBasisSource;
  readonly coordinatePosture: OpticCoordinatePosture;
};

/**
 * The public optic (`Optic` in the advanced API): reads one Lane through its
 * cone basis, live or pinned to a captured coordinate. It never reads a
 * checkpoint.
 */
export default class WorldlineOptic extends LocatedOptic {
  constructor(options: WorldlineOpticOptions) {
    super(new ConeWitnessLocator({ worldline: options.worldline, source: options.cone }), {
      coordinatePosture: options.coordinatePosture,
      aperturePosture: OpticAperturePosture.defaultFullRead(),
      basisPosture: OpticBasisPosture.coneBasis(),
      evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    });
    Object.freeze(this);
  }
}
