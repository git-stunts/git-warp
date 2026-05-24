import GraphModelMigrationBasis from './GraphModelMigrationBasis.ts';
import GraphModelMigrationContentMapping from './GraphModelMigrationContentMapping.ts';
import GraphModelMigrationEdgeMapping from './GraphModelMigrationEdgeMapping.ts';
import GraphModelMigrationManifestVersion from './GraphModelMigrationManifestVersion.ts';
import GraphModelMigrationNodeMapping from './GraphModelMigrationNodeMapping.ts';
import GraphModelMigrationNotice from './GraphModelMigrationNotice.ts';
import GraphModelMigrationPropertyMapping from './GraphModelMigrationPropertyMapping.ts';
import WarpError from '../errors/WarpError.ts';

export type GraphModelMigrationManifestFields = {
  readonly version: GraphModelMigrationManifestVersion;
  readonly sourceBasis: GraphModelMigrationBasis;
  readonly targetBasis: GraphModelMigrationBasis;
  readonly nodeMappings: readonly GraphModelMigrationNodeMapping[];
  readonly edgeMappings: readonly GraphModelMigrationEdgeMapping[];
  readonly propertyMappings: readonly GraphModelMigrationPropertyMapping[];
  readonly contentMappings: readonly GraphModelMigrationContentMapping[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];
};

/** Runtime-backed root manifest for a dry-run graph-model migration plan. */
export default class GraphModelMigrationManifest {
  readonly version: GraphModelMigrationManifestVersion;
  readonly sourceBasis: GraphModelMigrationBasis;
  readonly targetBasis: GraphModelMigrationBasis;
  readonly nodeMappings: readonly GraphModelMigrationNodeMapping[];
  readonly edgeMappings: readonly GraphModelMigrationEdgeMapping[];
  readonly propertyMappings: readonly GraphModelMigrationPropertyMapping[];
  readonly contentMappings: readonly GraphModelMigrationContentMapping[];
  readonly warnings: readonly GraphModelMigrationNotice[];
  readonly fatalErrors: readonly GraphModelMigrationNotice[];

  constructor(fields: GraphModelMigrationManifestFields) {
    const checkedFields = requireFields(fields);
    this.version = requireVersion(checkedFields.version);
    this.sourceBasis = requireBasis(checkedFields.sourceBasis, 'sourceBasis');
    this.targetBasis = requireBasis(checkedFields.targetBasis, 'targetBasis');
    this.nodeMappings = freezeNodeMappings(checkedFields.nodeMappings);
    this.edgeMappings = freezeEdgeMappings(checkedFields.edgeMappings);
    this.propertyMappings = freezePropertyMappings(checkedFields.propertyMappings);
    this.contentMappings = freezeContentMappings(checkedFields.contentMappings);
    this.warnings = freezeWarningNotices(checkedFields.warnings);
    this.fatalErrors = freezeFatalNotices(checkedFields.fatalErrors);
    Object.freeze(this);
  }

  /** Returns true when the manifest contains fatal planning failures. */
  hasFatalErrors(): boolean {
    return this.fatalErrors.length > 0;
  }
}

/** Validates the constructor envelope. */
function requireFields(
  fields: GraphModelMigrationManifestFields | null | undefined,
): GraphModelMigrationManifestFields {
  if (fields === null || fields === undefined) {
    throw new WarpError('GraphModelMigrationManifest fields must be provided', 'E_VALIDATION');
  }
  return fields;
}

/** Requires a runtime-backed manifest version. */
function requireVersion(version: GraphModelMigrationManifestVersion): GraphModelMigrationManifestVersion {
  if (!(version instanceof GraphModelMigrationManifestVersion)) {
    throw new WarpError(
      'GraphModelMigrationManifest version must be a GraphModelMigrationManifestVersion',
      'E_VALIDATION',
    );
  }
  return version;
}

/** Requires a runtime-backed migration basis. */
function requireBasis(basis: GraphModelMigrationBasis, name: string): GraphModelMigrationBasis {
  if (!(basis instanceof GraphModelMigrationBasis)) {
    throw new WarpError(`${name} must be a GraphModelMigrationBasis`, 'E_VALIDATION');
  }
  return basis;
}

/** Validates and freezes node mappings. */
function freezeNodeMappings(
  mappings: readonly GraphModelMigrationNodeMapping[],
): readonly GraphModelMigrationNodeMapping[] {
  const checked = requireArray(mappings, 'nodeMappings').map(requireNodeMapping);
  requireUnique(checked.map((mapping) => mapping.legacyNodeId), 'legacy node mapping');
  return Object.freeze(checked);
}

/** Validates and freezes edge mappings. */
function freezeEdgeMappings(
  mappings: readonly GraphModelMigrationEdgeMapping[],
): readonly GraphModelMigrationEdgeMapping[] {
  const checked = requireArray(mappings, 'edgeMappings').map(requireEdgeMapping);
  requireUnique(checked.map((mapping) => mapping.legacyEdgeId), 'legacy edge mapping');
  return Object.freeze(checked);
}

/** Validates and freezes property mappings. */
function freezePropertyMappings(
  mappings: readonly GraphModelMigrationPropertyMapping[],
): readonly GraphModelMigrationPropertyMapping[] {
  const checked = requireArray(mappings, 'propertyMappings').map(requirePropertyMapping);
  requireUnique(checked.map((mapping) => mapping.legacyKey()), 'legacy property mapping');
  return Object.freeze(checked);
}

/** Validates and freezes content mappings. */
function freezeContentMappings(
  mappings: readonly GraphModelMigrationContentMapping[],
): readonly GraphModelMigrationContentMapping[] {
  const checked = requireArray(mappings, 'contentMappings').map(requireContentMapping);
  requireUnique(checked.map((mapping) => mapping.legacyContentKey), 'legacy content mapping');
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

/** Requires an array field. */
function requireArray<T>(items: readonly T[] | null | undefined, label: string): readonly T[] {
  if (items === null || items === undefined || !Array.isArray(items)) {
    throw new WarpError(`GraphModelMigrationManifest ${label} must be an array`, 'E_VALIDATION');
  }
  const checkedItems: readonly T[] = items;
  return checkedItems;
}

/** Requires a node mapping instance. */
function requireNodeMapping(mapping: GraphModelMigrationNodeMapping): GraphModelMigrationNodeMapping {
  if (!(mapping instanceof GraphModelMigrationNodeMapping)) {
    throw new WarpError('nodeMappings must contain node mappings', 'E_VALIDATION');
  }
  return mapping;
}

/** Requires an edge mapping instance. */
function requireEdgeMapping(mapping: GraphModelMigrationEdgeMapping): GraphModelMigrationEdgeMapping {
  if (!(mapping instanceof GraphModelMigrationEdgeMapping)) {
    throw new WarpError('edgeMappings must contain edge mappings', 'E_VALIDATION');
  }
  return mapping;
}

/** Requires a property mapping instance. */
function requirePropertyMapping(
  mapping: GraphModelMigrationPropertyMapping,
): GraphModelMigrationPropertyMapping {
  if (!(mapping instanceof GraphModelMigrationPropertyMapping)) {
    throw new WarpError('propertyMappings must contain property mappings', 'E_VALIDATION');
  }
  return mapping;
}

/** Requires a content mapping instance. */
function requireContentMapping(
  mapping: GraphModelMigrationContentMapping,
): GraphModelMigrationContentMapping {
  if (!(mapping instanceof GraphModelMigrationContentMapping)) {
    throw new WarpError('contentMappings must contain content mappings', 'E_VALIDATION');
  }
  return mapping;
}

/** Requires a notice instance. */
function requireNotice(notice: GraphModelMigrationNotice): GraphModelMigrationNotice {
  if (!(notice instanceof GraphModelMigrationNotice)) {
    throw new WarpError('migration notices must be GraphModelMigrationNotice instances', 'E_VALIDATION');
  }
  return notice;
}

/** Requires no duplicate keys in a manifest section. */
function requireUnique(keys: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new WarpError(`GraphModelMigrationManifest duplicates ${label} ${key}`, 'E_VALIDATION');
    }
    seen.add(key);
  }
}
