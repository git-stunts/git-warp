import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationScratchRef from './GraphModelMigrationScratchRef.ts';
import GraphModelMigrationScratchWrittenPatch from './GraphModelMigrationScratchWrittenPatch.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationScratchWriteResultFields = {
  readonly scratchRef: GraphModelMigrationScratchRef | null;
  readonly scratchHead: string | null;
  readonly writtenPatches: readonly GraphModelMigrationScratchWrittenPatch[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Result value for an explicit scratch migration history write. */
export default class GraphModelMigrationScratchWriteResult {
  readonly scratchRef: GraphModelMigrationScratchRef | null;
  readonly scratchHead: string | null;
  readonly writtenPatches: readonly GraphModelMigrationScratchWrittenPatch[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationScratchWriteResultFields) {
    const checkedFields = requireFields(fields);
    this.scratchRef = requireOptionalScratchRef(checkedFields.scratchRef);
    this.scratchHead = requireOptionalHead(checkedFields.scratchHead);
    this.writtenPatches = freezeWrittenPatches(checkedFields.writtenPatches);
    this.warnings = freezeWarningNotices(checkedFields.warnings);
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    requireFatalResultShape(this.scratchHead, this.writtenPatches, this.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when the write was blocked before completion. */
  hasFatalErrors(): boolean {
    return this.fatalErrors.length > 0;
  }
}

function requireFields(
  fields: GraphModelMigrationScratchWriteResultFields | null | undefined,
): GraphModelMigrationScratchWriteResultFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationScratchWriteResult fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

function requireOptionalScratchRef(
  scratchRef: GraphModelMigrationScratchRef | null,
): GraphModelMigrationScratchRef | null {
  if (scratchRef !== null && !(scratchRef instanceof GraphModelMigrationScratchRef)) {
    throw new WarpError('scratchRef must be a GraphModelMigrationScratchRef or null', 'E_VALIDATION');
  }
  return scratchRef;
}

function requireOptionalHead(scratchHead: string | null): string | null {
  if (scratchHead === null) {
    return null;
  }
  if (typeof scratchHead !== 'string' || scratchHead.length === 0) {
    throw new WarpError('scratchHead must be a non-empty string or null', 'E_VALIDATION');
  }
  return scratchHead;
}

function freezeWrittenPatches(
  writtenPatches: readonly GraphModelMigrationScratchWrittenPatch[],
): readonly GraphModelMigrationScratchWrittenPatch[] {
  if (!Array.isArray(writtenPatches)) {
    throw new WarpError('writtenPatches must be an array', 'E_VALIDATION');
  }
  const checked = writtenPatches.map(requireWrittenPatch);
  requireUniqueOperationKeys(checked);
  return Object.freeze([...checked]);
}

function requireWrittenPatch(
  writtenPatch: GraphModelMigrationScratchWrittenPatch,
): GraphModelMigrationScratchWrittenPatch {
  if (!(writtenPatch instanceof GraphModelMigrationScratchWrittenPatch)) {
    throw new WarpError('writtenPatches must contain scratch written patches', 'E_VALIDATION');
  }
  return writtenPatch;
}

function requireUniqueOperationKeys(
  writtenPatches: readonly GraphModelMigrationScratchWrittenPatch[],
): void {
  const seen = new Set<string>();
  for (const writtenPatch of writtenPatches) {
    const key = writtenPatch.operationKey();
    if (seen.has(key)) {
      throw new WarpError(`duplicate scratch written operation ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

function freezeWarningNotices(
  warnings: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  if (!Array.isArray(warnings)) {
    throw new WarpError('warnings must be an array', 'E_VALIDATION');
  }
  return Object.freeze(warnings.map(requireWarningNotice));
}

function freezeFatalNotices(
  fatalErrors: readonly GraphModelMigrationNotice[],
): readonly GraphModelMigrationNotice[] {
  if (!Array.isArray(fatalErrors)) {
    throw new WarpError('fatalErrors must be an array', 'E_VALIDATION');
  }
  return Object.freeze(fatalErrors.map(requireFatalNotice));
}

function requireWarningNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice) || notice.isFatal()) {
    throw new WarpError('warnings must contain warning migration notices', 'E_VALIDATION');
  }
  return notice;
}

function requireFatalNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice) || !notice.isFatal()) {
    throw new WarpError('fatalErrors must contain fatal migration notices', 'E_VALIDATION');
  }
  return notice;
}

function requireFatalResultShape(
  scratchHead: string | null,
  writtenPatches: readonly GraphModelMigrationScratchWrittenPatch[],
  fatalErrors: readonly GraphModelMigrationNotice[],
): void {
  if (fatalErrors.length > 0 && (scratchHead !== null || writtenPatches.length > 0)) {
    throw new WarpError('fatal scratch write results must not include written output', 'E_VALIDATION');
  }
}
