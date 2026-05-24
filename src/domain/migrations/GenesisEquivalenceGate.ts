import GenesisDivergenceReporter from './GenesisDivergenceReporter.ts';
import GenesisEquivalenceComparisonBasis from './GenesisEquivalenceComparisonBasis.ts';
import GenesisEquivalenceGateResult from './GenesisEquivalenceGateResult.ts';
import GenesisEquivalenceProof from './GenesisEquivalenceProof.ts';
import GenesisEquivalenceProofFailure from './GenesisEquivalenceProofFailure.ts';
import GenesisEquivalenceReading from './GenesisEquivalenceReading.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

const MISSING_EQUIVALENCE_BOUNDARY_CODE = 'E_MISSING_EQUIVALENCE_BOUNDARY';

/** Gates scratch migration promotion on genesis replay equivalence. */
export default class GenesisEquivalenceGate {
  /** Compares legacy and scratch readings and returns promotion evidence. */
  evaluate(
    basis: GenesisEquivalenceComparisonBasis,
    legacyReading: GenesisEquivalenceReading,
    scratchReading: GenesisEquivalenceReading,
  ): GenesisEquivalenceGateResult {
    const checkedBasis = requireBasis(basis);
    const checkedLegacy = requireReading(legacyReading, 'legacyReading');
    const checkedScratch = requireReading(scratchReading, 'scratchReading');
    const proofResult = new GenesisEquivalenceProof().compare(
      checkedBasis,
      checkedLegacy,
      checkedScratch,
    );
    const divergenceReport = proofResult instanceof GenesisEquivalenceProofFailure
      ? new GenesisDivergenceReporter().report(proofResult)
      : null;

    return new GenesisEquivalenceGateResult({
      proofResult,
      divergenceReport,
      fatalErrors: collectBoundaryFatalErrors(checkedLegacy, checkedScratch),
    });
  }
}

function collectBoundaryFatalErrors(
  legacyReading: GenesisEquivalenceReading,
  scratchReading: GenesisEquivalenceReading,
): readonly GraphModelMigrationNotice[] {
  const missing = legacyReading.facts
    .concat(scratchReading.facts)
    .filter((fact) => fact.boundary === null);
  if (missing.length === 0) {
    return Object.freeze([]);
  }
  return Object.freeze([
    GraphModelMigrationNotice.fatal(
      MISSING_EQUIVALENCE_BOUNDARY_CODE,
      `genesis equivalence gate requires boundary evidence for ${missing.length} visible fact(s)`,
    ),
  ]);
}

function requireBasis(basis: GenesisEquivalenceComparisonBasis): GenesisEquivalenceComparisonBasis {
  if (!(basis instanceof GenesisEquivalenceComparisonBasis)) {
    throw new WarpError('basis must be a GenesisEquivalenceComparisonBasis', 'E_VALIDATION');
  }
  return basis;
}

function requireReading(reading: GenesisEquivalenceReading, label: string): GenesisEquivalenceReading {
  if (!(reading instanceof GenesisEquivalenceReading)) {
    throw new WarpError(`${label} must be a GenesisEquivalenceReading`, 'E_VALIDATION');
  }
  return reading;
}
