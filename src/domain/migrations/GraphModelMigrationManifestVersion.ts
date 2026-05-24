import WarpError from '../errors/WarpError.ts';

export const GRAPH_MODEL_MIGRATION_MANIFEST_VERSION = 1;

/** Runtime-backed version for graph-model migration manifests. */
export default class GraphModelMigrationManifestVersion {
  readonly value: number;

  constructor(value: number) {
    this.value = requireManifestVersion(value);
    Object.freeze(this);
  }

  /** Returns the current manifest version. */
  static current(): GraphModelMigrationManifestVersion {
    return new GraphModelMigrationManifestVersion(GRAPH_MODEL_MIGRATION_MANIFEST_VERSION);
  }
}

/** Validates a manifest version number. */
function requireManifestVersion(value: number): number {
  if (value !== GRAPH_MODEL_MIGRATION_MANIFEST_VERSION) {
    throw new WarpError(
      `Graph-model migration manifest version must be ${GRAPH_MODEL_MIGRATION_MANIFEST_VERSION}`,
      'E_VALIDATION',
    );
  }
  return value;
}
