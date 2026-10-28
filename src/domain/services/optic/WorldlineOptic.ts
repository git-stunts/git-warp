import ContinuumEvidencePosture from '../../continuum/ContinuumEvidencePosture.ts';
import QueryError from '../../errors/QueryError.ts';
import ConeWitnessLocator from './ConeWitnessLocator.ts';
import LocatedOptic from './LocatedOptic.ts';
import OpticAperturePosture from './OpticAperturePosture.ts';
import OpticBasisPosture from './OpticBasisPosture.ts';
import type OpticCoordinatePosture from './OpticCoordinatePosture.ts';
import type OpticWitnessLocator from './OpticWitnessLocator.ts';

/**
 * An optic over a Lane's cone records (#1039): live, or pinned to a captured
 * coordinate. The locator is typed by its public base so the published
 * declaration of this public class names no internal cone type; the
 * constructor still admits only a cone witness locator.
 */
type WorldlineOpticOptions = {
  readonly locator: OpticWitnessLocator;
  readonly coordinatePosture: OpticCoordinatePosture;
};

/**
 * The public optic (`Optic` in the advanced API): reads one Lane through its
 * cone basis, live or pinned to a captured coordinate. It never reads a
 * checkpoint.
 */
export default class WorldlineOptic extends LocatedOptic {
  constructor(options: WorldlineOpticOptions) {
    super(requireConeLocator(options.locator), {
      coordinatePosture: options.coordinatePosture,
      aperturePosture: OpticAperturePosture.defaultFullRead(),
      basisPosture: OpticBasisPosture.coneBasis(),
      evidencePosture: ContinuumEvidencePosture.translatedGitWarpEvidence(),
    });
    Object.freeze(this);
  }
}

function requireConeLocator(locator: OpticWitnessLocator): ConeWitnessLocator {
  if (!(locator instanceof ConeWitnessLocator)) {
    throw new QueryError('A worldline optic reads only through a cone witness locator.', {
      code: 'E_WORLDLINE_OPTIC',
      context: { field: 'locator' },
    });
  }
  return locator;
}
