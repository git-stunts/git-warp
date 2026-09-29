import PackagePayloadAssessment from './PackagePayloadAssessment.ts';
import type PackagePayloadInventory from './PackagePayloadInventory.ts';

const REQUIRED_PATHS = Object.freeze([
  'package.json',
  'README.md',
  'LICENSE',
  'NOTICE',
  'dist/index.js',
  'dist/index.d.ts',
  'dist/advanced.js',
  'dist/advanced.d.ts',
  'dist/diagnostics.js',
  'dist/diagnostics.d.ts',
  'dist/charts.js',
  'dist/charts.d.ts',
  'dist/testing.js',
  'dist/testing.d.ts',
  'dist/bin/git-warp.js',
  'bin/git-warp',
  'dist/scripts/v18-to-v19/migrate.js',
  'dist/scripts/formatFailure.js',
  'dist/scripts/upgrade-v16-to-v17.js',
  'dist/scripts/migrations/v17.0.0/CheckpointMaterializationMigration.js',
  'scripts/hooks/post-merge.sh',
  'scripts/install-git-warp.sh',
  'scripts/uninstall-git-warp.sh',
  'docs/migrations/v19/README.md',
  'docs/READINGS_AND_OPTICS.md',
]);

const REQUIRED_PATH_SET = new Set(REQUIRED_PATHS);

const ALLOWED_PREFIXES = Object.freeze([
  'dist/src/',
  'dist/bin/',
  'dist/scripts/migrations/v17.0.0/',
  'dist/scripts/v18-to-v19/adapters/',
]);

// Repository documentation that is deliberately withheld from the npm
// artifact. Retained packaged documents link to commit-pinned repository
// copies instead.
const WITHHELD_DOCUMENTATION_PATHS = Object.freeze(['CHANGELOG.md']);

const FORBIDDEN_PREFIXES = Object.freeze([
  'dist/scripts/v18-to-v19/performance/',
  'docs/topics/',
  'docs/operations/',
]);

// Executable implementation roots. No public declaration reaches into them, so
// they publish JavaScript only; a declaration here is an unwanted file.
const JAVASCRIPT_ONLY_PREFIXES = Object.freeze(['dist/bin/', 'dist/scripts/']);

/** Defines the supported published assets and payload ceilings. */
export default class PackagePayloadPolicy {
  readonly maxPackedBytes = 1_000_000;
  readonly maxUnpackedBytes = 4_300_000;
  readonly maxEntryCount = 1_650;

  /** Reports every missing asset, forbidden path, and exceeded size limit. */
  assess(inventory: PackagePayloadInventory): PackagePayloadAssessment {
    const violations = inventory.entries
      .filter((entry) => !this.allows(entry.path))
      .map((entry) => `unexpected published path: ${entry.path}`);
    const paths = new Set(inventory.entries.map((entry) => entry.path));
    for (const requiredPath of REQUIRED_PATHS) {
      if (!paths.has(requiredPath)) {
        violations.push(`required path is missing: ${requiredPath}`);
      }
    }
    appendLimitViolations(violations, inventory, this);
    return new PackagePayloadAssessment(violations);
  }

  /** Admits supported assets only after applying explicit exclusions. */
  private allows(path: string): boolean {
    if (isExcluded(path)) {
      return false;
    }
    return (
      REQUIRED_PATH_SET.has(path) ||
      ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
      isDirectV18ToV19Artifact(path)
    );
  }
}

/** Rejects repository-only documents and executable declarations. */
function isExcluded(path: string): boolean {
  return (
    WITHHELD_DOCUMENTATION_PATHS.includes(path) ||
    FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
    isNonJavaScriptImplementationArtifact(path)
  );
}

/** Keeps executable implementation roots JavaScript-only. */
function isNonJavaScriptImplementationArtifact(path: string): boolean {
  return (
    JAVASCRIPT_ONLY_PREFIXES.some((prefix) => path.startsWith(prefix)) && !path.endsWith('.js')
  );
}

/** Admits direct migration modules without admitting additional subtrees. */
function isDirectV18ToV19Artifact(path: string): boolean {
  const prefix = 'dist/scripts/v18-to-v19/';
  if (!path.startsWith(prefix)) {
    return false;
  }
  const relativePath = path.slice(prefix.length);
  return !relativePath.includes('/') && relativePath.endsWith('.js');
}

/** Checks compressed bytes, unpacked bytes, and entries independently. */
function appendLimitViolations(
  violations: string[],
  inventory: PackagePayloadInventory,
  policy: PackagePayloadPolicy
): void {
  if (inventory.packedBytes > policy.maxPackedBytes) {
    violations.push(
      `compressed size ${String(inventory.packedBytes)} exceeds ${String(policy.maxPackedBytes)}`
    );
  }
  if (inventory.unpackedBytes > policy.maxUnpackedBytes) {
    violations.push(
      `unpacked size ${String(inventory.unpackedBytes)} exceeds ${String(policy.maxUnpackedBytes)}`
    );
  }
  if (inventory.entryCount > policy.maxEntryCount) {
    violations.push(
      `entry count ${String(inventory.entryCount)} exceeds ${String(policy.maxEntryCount)}`
    );
  }
}
