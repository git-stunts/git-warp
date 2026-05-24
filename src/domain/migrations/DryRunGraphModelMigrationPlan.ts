import GraphModelMigrationManifest from './GraphModelMigrationManifest.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationPlannedGraphOperation from './GraphModelMigrationPlannedGraphOperation.ts';
import WarpError from '../errors/WarpError.ts';

export type DryRunGraphModelMigrationPlanFields = {
  readonly manifest: GraphModelMigrationManifest | null;
  readonly plannedOperations: readonly GraphModelMigrationPlannedGraphOperation[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Runtime-backed result value from a dry-run graph-model migration plan. */
export default class DryRunGraphModelMigrationPlan {
  readonly manifest: GraphModelMigrationManifest | null;
  readonly plannedOperations: readonly GraphModelMigrationPlannedGraphOperation[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: DryRunGraphModelMigrationPlanFields) {
    const checkedFields = requireFields(fields);
    this.manifest = requireOptionalManifest(checkedFields.manifest);
    this.plannedOperations = freezePlannedOperations(checkedFields.plannedOperations);
    this.warnings = freezeWarningNotices(checkedFields.warnings);
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requireManifestMatchesFatality(this.manifest, this.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when dry-run planning failed closed. */
  hasFatalErrors(): boolean {
    return this.fatalErrors.length > 0;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: DryRunGraphModelMigrationPlanFields | null | undefined,
): DryRunGraphModelMigrationPlanFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('DryRunGraphModelMigrationPlan fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a manifest when one exists. */
function requireOptionalManifest(
  manifest: GraphModelMigrationManifest | null,
): GraphModelMigrationManifest | null {
  if (manifest !== null && !(manifest instanceof GraphModelMigrationManifest)) {
    throw new WarpError('manifest must be a GraphModelMigrationManifest', 'E_VALIDATION');
  }
  return manifest;
}

/** Validates and freezes planned graph operation facts. */
function freezePlannedOperations(
  operations: readonly GraphModelMigrationPlannedGraphOperation[],
): readonly GraphModelMigrationPlannedGraphOperation[] {
  const checked = requireArray(operations, 'plannedOperations').map(requirePlannedOperation);
  return Object.freeze(checked);
}

/** Validates and freezes warning notices. */
function freezeWarningNotices(
  notices: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  const checked = requireArray(notices, 'warnings').map(requireNotice);
  for (const notice of checked) {
    if (notice.isFatal()) {
      throw new WarpError('warnings contains the wrong notice kind', 'E_VALIDATION');
    }
  }
  return Object.freeze(checked);
}

/** Validates and freezes fatal notices. */
function freezeFatalNotices(
  notices: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  const checked = requireArray(notices, 'fatalErrors').map(requireNotice);
  for (const notice of checked) {
    if (!notice.isFatal()) {
      throw new WarpError('fatalErrors contains the wrong notice kind', 'E_VALIDATION');
    }
  }
  return Object.freeze(checked);
}

/** Requires no manifest when fatal planning errors exist. */
function requireManifestMatchesFatality(
  manifest: GraphModelMigrationManifest | null,
  fatalErrors: readonly GraphModelMigrationNotice[],
): void {
  if (fatalErrors.length > 0 && manifest !== null) {
    throw new WarpError('fatal dry-run plans must not contain a manifest', 'E_VALIDATION');
  }
  if (fatalErrors.length === 0 && manifest === null) {
    throw new WarpError('successful dry-run plans must contain a manifest', 'E_VALIDATION');
  }
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`DryRunGraphModelMigrationPlan ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a planned graph operation instance. */
function requirePlannedOperation(
  operation: GraphModelMigrationPlannedGraphOperation,
): GraphModelMigrationPlannedGraphOperation {
  if (!(operation instanceof GraphModelMigrationPlannedGraphOperation)) {
    throw new WarpError('plannedOperations must contain planned graph operations', 'E_VALIDATION');
  }
  return operation;
}

/** Requires a migration notice instance. */
function requireNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice)) {
    throw new WarpError('dry-run plan notices must be GraphModelMigrationNotice instances', 'E_VALIDATION');
  }
  return notice;
}
