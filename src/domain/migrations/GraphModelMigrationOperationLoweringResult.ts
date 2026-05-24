import GraphModelMigrationLoweredPatchPlan from './GraphModelMigrationLoweredPatchPlan.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationOperationLoweringResultFields = {
  readonly patchPlan: GraphModelMigrationLoweredPatchPlan | null;
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Result value for pure graph-model migration operation lowering. */
export default class GraphModelMigrationOperationLoweringResult {
  readonly patchPlan: GraphModelMigrationLoweredPatchPlan | null;
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationOperationLoweringResultFields) {
    const checkedFields = requireFields(fields);
    this.patchPlan = requireOptionalPatchPlan(checkedFields.patchPlan);
    this.warnings = freezeWarningNotices(checkedFields.warnings);
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requirePatchPlanMatchesFatality(this.patchPlan, this.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when lowering failed closed. */
  hasFatalErrors(): boolean {
    return this.fatalErrors.length > 0;
  }
}

function requireFields(
  fields: GraphModelMigrationOperationLoweringResultFields | null | undefined,
): GraphModelMigrationOperationLoweringResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationOperationLoweringResult fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireOptionalPatchPlan(
  patchPlan: GraphModelMigrationLoweredPatchPlan | null,
): GraphModelMigrationLoweredPatchPlan | null {
  if (patchPlan !== null && !(patchPlan instanceof GraphModelMigrationLoweredPatchPlan)) {
    throw new WarpError('patchPlan must be a GraphModelMigrationLoweredPatchPlan', 'E_VALIDATION');
  }
  return patchPlan;
}

function freezeWarningNotices(
  notices: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  const checked = requireNoticeArray(notices, 'warnings');
  for (const notice of checked) {
    if (notice.isFatal()) {
      throw new WarpError('warnings contains the wrong notice kind', 'E_VALIDATION');
    }
  }
  return Object.freeze(checked);
}

function freezeFatalNotices(
  notices: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  const checked = requireNoticeArray(notices, 'fatalErrors');
  for (const notice of checked) {
    if (!notice.isFatal()) {
      throw new WarpError('fatalErrors contains the wrong notice kind', 'E_VALIDATION');
    }
  }
  return Object.freeze(checked);
}

function requireNoticeArray(
  notices: readonly GraphModelMigrationNotice[],
  label: string,
): readonly GraphModelMigrationNotice[] {
  if (!Array.isArray(notices)) {
    throw new WarpError(`${label} must be an array`, 'E_VALIDATION');
  }
  return notices.map(requireNotice);
}

function requireNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice)) {
    throw new WarpError('notices must contain GraphModelMigrationNotice instances', 'E_VALIDATION');
  }
  return notice;
}

function requirePatchPlanMatchesFatality(
  patchPlan: GraphModelMigrationLoweredPatchPlan | null,
  fatalErrors: readonly GraphModelMigrationNotice[],
): void {
  if (fatalErrors.length > 0 && patchPlan !== null) {
    throw new WarpError('fatal lowering results must not contain a patch plan', 'E_VALIDATION');
  }
  if (fatalErrors.length === 0 && patchPlan === null) {
    throw new WarpError('successful lowering results must contain a patch plan', 'E_VALIDATION');
  }
}
