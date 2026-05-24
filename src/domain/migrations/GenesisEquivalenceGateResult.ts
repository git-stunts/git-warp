import GenesisDivergenceReport from './GenesisDivergenceReport.ts';
import GenesisEquivalenceProofFailure from './GenesisEquivalenceProofFailure.ts';
import type { GenesisEquivalenceProofResult } from './GenesisEquivalenceProofResult.ts';
import GenesisEquivalenceProofSuccess from './GenesisEquivalenceProofSuccess.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

export type GenesisEquivalenceGateResultFields = {
  readonly proofResult: GenesisEquivalenceProofResult;
  readonly divergenceReport: GenesisDivergenceReport | null;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Promotion gate result for scratch migration genesis equivalence. */
export default class GenesisEquivalenceGateResult {
  readonly proofResult: GenesisEquivalenceProofResult;
  readonly divergenceReport: GenesisDivergenceReport | null;
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GenesisEquivalenceGateResultFields) {
    const checkedFields = requireFields(fields);
    this.proofResult = requireProofResult(checkedFields.proofResult);
    this.divergenceReport = requireOptionalDivergenceReport(checkedFields.divergenceReport);
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requireReportMatchesProof(this.proofResult, this.divergenceReport);
    Object.freeze(this);
  }

  /** Returns true only when equivalence passed and no promotion blocker exists. */
  allowsPromotion(): boolean {
    return this.proofResult instanceof GenesisEquivalenceProofSuccess
      && this.fatalErrors.length === 0;
  }
}

function requireFields(
  fields: GenesisEquivalenceGateResultFields | null | undefined,
): GenesisEquivalenceGateResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GenesisEquivalenceGateResult fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireProofResult(result: GenesisEquivalenceProofResult): GenesisEquivalenceProofResult {
  if (!(result instanceof GenesisEquivalenceProofSuccess)
    && !(result instanceof GenesisEquivalenceProofFailure)) {
    throw new WarpError('proofResult must be a genesis equivalence proof result', 'E_VALIDATION');
  }
  return result;
}

function requireOptionalDivergenceReport(
  report: GenesisDivergenceReport | null,
): GenesisDivergenceReport | null {
  if (report !== null && !(report instanceof GenesisDivergenceReport)) {
    throw new WarpError('divergenceReport must be a GenesisDivergenceReport or null', 'E_VALIDATION');
  }
  return report;
}

function freezeFatalNotices(
  fatalErrors: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  if (!Array.isArray(fatalErrors)) {
    throw new WarpError('fatalErrors must be an array', 'E_VALIDATION');
  }
  return Object.freeze(fatalErrors.map(requireFatalNotice));
}

function requireFatalNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice) || !notice.isFatal()) {
    throw new WarpError('fatalErrors must contain fatal migration notices', 'E_VALIDATION');
  }
  return notice;
}

function requireReportMatchesProof(
  proofResult: GenesisEquivalenceProofResult,
  report: GenesisDivergenceReport | null,
): void {
  if (proofResult instanceof GenesisEquivalenceProofFailure && report === null) {
    throw new WarpError('failed gate results must include a divergence report', 'E_VALIDATION');
  }
  if (proofResult instanceof GenesisEquivalenceProofSuccess && report !== null) {
    throw new WarpError('successful gate results must not include a divergence report', 'E_VALIDATION');
  }
}
