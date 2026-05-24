import { compareStrings } from '../utils/StringComparison.ts';
import GraphModelMigrationBasis from './GraphModelMigrationBasis.ts';
import GraphModelMigrationContentSource from './GraphModelMigrationContentSource.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationPatchDescriptor from './GraphModelMigrationPatchDescriptor.ts';
import GraphModelMigrationStateSnapshotReference from './GraphModelMigrationStateSnapshotReference.ts';
import GraphModelMigrationWriterChainDescriptor from './GraphModelMigrationWriterChainDescriptor.ts';
import WarpError from '../errors/WarpError.ts';

const MISSING_SOURCE_BASIS_CODE = 'E_MISSING_SOURCE_BASIS';

export type GraphModelMigrationSourceInventoryFields = {
  readonly graphId: string;
  readonly sourceBasis?: GraphModelMigrationBasis | null;
  readonly writerChains: readonly GraphModelMigrationWriterChainDescriptor[];
  readonly patchDescriptors: readonly GraphModelMigrationPatchDescriptor[];
  readonly stateSnapshot?: GraphModelMigrationStateSnapshotReference | null;
  readonly contentSources: readonly GraphModelMigrationContentSource[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Runtime-backed source fact inventory for dry-run graph-model migration. */
export default class GraphModelMigrationSourceInventory {
  readonly graphId: string;
  readonly sourceBasis: GraphModelMigrationBasis | null;
  readonly writerChains: readonly GraphModelMigrationWriterChainDescriptor[];
  readonly patchDescriptors: readonly GraphModelMigrationPatchDescriptor[];
  readonly stateSnapshot: GraphModelMigrationStateSnapshotReference | null;
  readonly contentSources: readonly GraphModelMigrationContentSource[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationSourceInventoryFields) {
    const checkedFields = requireFields(fields);
    this.graphId = requireNonEmptyString(checkedFields.graphId, 'graphId');
    this.sourceBasis = requireOptionalBasis(checkedFields.sourceBasis ?? null);
    this.writerChains = freezeWriterChains(checkedFields.writerChains);
    this.patchDescriptors = freezePatchDescriptors(checkedFields.patchDescriptors);
    this.stateSnapshot = requireOptionalStateSnapshot(checkedFields.stateSnapshot ?? null);
    this.contentSources = freezeContentSources(checkedFields.contentSources);
    this.warnings = freezeNotices(checkedFields.warnings, false, 'warnings');
    this.fatalErrors = freezeFatalErrors(
      checkedFields.fatalErrors,
      this.sourceBasis === null,
    );
    requirePatchChainConsistency(this.writerChains, this.patchDescriptors);
    Object.freeze(this);
  }

  /** Returns true when collection found planning-blocking source problems. */
  hasFatalErrors(): boolean {
    return this.fatalErrors.length > 0;
  }

  /** Returns true when the inventory can be used by a dry-run planner. */
  isUsableForPlanning(): boolean {
    return this.sourceBasis !== null && !this.hasFatalErrors();
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationSourceInventoryFields | null | undefined,
): GraphModelMigrationSourceInventoryFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationSourceInventory fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Validates a required non-empty string. */
function requireNonEmptyString(value: string, name: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${name} must be a non-empty string`, 'E_VALIDATION');
  }
  return value;
}

/** Requires a basis when one has been collected. */
function requireOptionalBasis(
  basis: GraphModelMigrationBasis | null,
): GraphModelMigrationBasis | null {
  if (basis !== null && !(basis instanceof GraphModelMigrationBasis)) {
    throw new WarpError('sourceBasis must be a GraphModelMigrationBasis', 'E_VALIDATION');
  }
  return basis;
}

/** Requires a state snapshot reference when one has been collected. */
function requireOptionalStateSnapshot(
  stateSnapshot: GraphModelMigrationStateSnapshotReference | null,
): GraphModelMigrationStateSnapshotReference | null {
  if (
    stateSnapshot !== null
    && !(stateSnapshot instanceof GraphModelMigrationStateSnapshotReference)
  ) {
    throw new WarpError('stateSnapshot must be a GraphModelMigrationStateSnapshotReference', 'E_VALIDATION');
  }
  return stateSnapshot;
}

/** Validates and freezes source writer chains. */
function freezeWriterChains(
  writerChains: readonly GraphModelMigrationWriterChainDescriptor[],
): readonly GraphModelMigrationWriterChainDescriptor[] {
  const checked = requireArray(writerChains, 'writerChains').map(requireWriterChain);
  requireUnique(checked.map((chain) => chain.writerId), 'writer chain');
  const patchIds = checked.flatMap((chain) => chain.patchIds);
  requireUnique(patchIds, 'writer-chain patch identity');
  return Object.freeze(checked);
}

/** Validates, sorts, and freezes source patch descriptors. */
function freezePatchDescriptors(
  patchDescriptors: readonly GraphModelMigrationPatchDescriptor[],
): readonly GraphModelMigrationPatchDescriptor[] {
  const checked = requireArray(patchDescriptors, 'patchDescriptors').map(requirePatchDescriptor);
  requireUnique(checked.map((patch) => patch.patchId), 'patch identity');
  requireUnique(checked.map((patch) => patch.writerSequenceKey()), 'writer sequence');
  return Object.freeze([...checked].sort(comparePatchDescriptors));
}

/** Validates and freezes source content facts. */
function freezeContentSources(
  contentSources: readonly GraphModelMigrationContentSource[],
): readonly GraphModelMigrationContentSource[] {
  const checked = requireArray(contentSources, 'contentSources').map(requireContentSource);
  requireUnique(checked.map((source) => source.legacyContentKey), 'content source');
  return Object.freeze(checked);
}

/** Validates and freezes warning notices. */
function freezeNotices(
  notices: readonly GraphModelMigrationNotice[],
  fatal: boolean,
  label: string,
): readonly GraphModelMigrationNotice[] {
  const checked = requireArray(notices, label).map(requireNotice);
  for (const notice of checked) {
    if (notice.isFatal() !== fatal) {
      throw new WarpError(`${label} contains the wrong notice kind`, 'E_VALIDATION');
    }
  }
  return Object.freeze(checked);
}

/** Validates fatal notices and adds collection-derived fatal conditions. */
function freezeFatalErrors(
  fatalErrors: readonly GraphModelMigrationNotice[],
  missingSourceBasis: boolean,
): readonly GraphModelMigrationNotice[] {
  const checked = freezeNotices(fatalErrors, true, 'fatalErrors');
  if (!missingSourceBasis) {
    return checked;
  }
  return Object.freeze([
    GraphModelMigrationNotice.fatal(
      MISSING_SOURCE_BASIS_CODE,
      'source basis was not collected',
    ),
    ...checked,
  ]);
}

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationSourceInventory ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a writer chain descriptor. */
function requireWriterChain(
  chain: GraphModelMigrationWriterChainDescriptor,
): GraphModelMigrationWriterChainDescriptor {
  if (!(chain instanceof GraphModelMigrationWriterChainDescriptor)) {
    throw new WarpError('writerChains must contain writer chain descriptors', 'E_VALIDATION');
  }
  return chain;
}

/** Requires a patch descriptor. */
function requirePatchDescriptor(
  patch: GraphModelMigrationPatchDescriptor,
): GraphModelMigrationPatchDescriptor {
  if (!(patch instanceof GraphModelMigrationPatchDescriptor)) {
    throw new WarpError('patchDescriptors must contain patch descriptors', 'E_VALIDATION');
  }
  return patch;
}

/** Requires a content source fact. */
function requireContentSource(
  source: GraphModelMigrationContentSource,
): GraphModelMigrationContentSource {
  if (!(source instanceof GraphModelMigrationContentSource)) {
    throw new WarpError('contentSources must contain content source facts', 'E_VALIDATION');
  }
  return source;
}

/** Requires a migration notice. */
function requireNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice)) {
    throw new WarpError('inventory notices must be GraphModelMigrationNotice instances', 'E_VALIDATION');
  }
  return notice;
}

/** Requires no duplicate keys in an inventory section. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationSourceInventory duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}

/** Requires patch descriptors to match their owning writer chains. */
function requirePatchChainConsistency(
  writerChains: readonly GraphModelMigrationWriterChainDescriptor[],
  patchDescriptors: readonly GraphModelMigrationPatchDescriptor[],
): void {
  const patchesById = new Map<string, GraphModelMigrationPatchDescriptor>();
  for (const patch of patchDescriptors) {
    patchesById.set(patch.patchId, patch);
  }

  const chainedPatchIds = new Set<string>();
  for (const chain of writerChains) {
    requireChainPatchDescriptors(chain, patchesById, chainedPatchIds);
  }

  for (const patch of patchDescriptors) {
    if (!chainedPatchIds.has(patch.patchId)) {
      throw new WarpError(
        `patch descriptor ${patch.patchId} is missing from writer chains`,
        'E_VALIDATION',
      );
    }
  }
}

/** Requires every patch in a writer chain to have a matching descriptor. */
function requireChainPatchDescriptors(
  chain: GraphModelMigrationWriterChainDescriptor,
  patchesById: ReadonlyMap<string, GraphModelMigrationPatchDescriptor>,
  chainedPatchIds: Set<string>,
): void {
  chain.patchIds.forEach((patchId, position) => {
    const descriptor = patchesById.get(patchId);
    if (descriptor === undefined) {
      throw new WarpError(`writer chain references unknown patch ${patchId}`, 'E_VALIDATION');
    }
    if (descriptor.writerId !== chain.writerId) {
      throw new WarpError(`patch descriptor ${patchId} belongs to the wrong writer`, 'E_VALIDATION');
    }
    if (descriptor.writerSequence !== position) {
      throw new WarpError(
        `patch descriptor ${patchId} does not match writer chain position`,
        'E_VALIDATION',
      );
    }
    chainedPatchIds.add(patchId);
  });
}

/** Compares patch descriptors deterministically by writer and sequence. */
function comparePatchDescriptors(
  left: GraphModelMigrationPatchDescriptor,
  right: GraphModelMigrationPatchDescriptor,
): number {
  const writerOrder = compareStrings(left.writerId, right.writerId);
  if (writerOrder !== 0) {
    return writerOrder;
  }
  if (left.writerSequence < right.writerSequence) {
    return -1;
  }
  if (left.writerSequence > right.writerSequence) {
    return 1;
  }
  return compareStrings(left.patchId, right.patchId);
}
