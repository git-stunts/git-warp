import PackagePayloadAssessment from './PackagePayloadAssessment.ts';
import type PackagePayloadInventory from './PackagePayloadInventory.ts';

const REQUIRED_PATHS = Object.freeze([
  'package.json',
  'README.md',
  'CHANGELOG.md',
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
  'dist/bin/git-warp.d.ts',
  'bin/git-warp',
  'dist/scripts/v18-to-v19/migrate.js',
  'dist/scripts/v18-to-v19/migrate.d.ts',
  'dist/scripts/formatFailure.js',
  'dist/scripts/formatFailure.d.ts',
  'dist/scripts/upgrade-v16-to-v17.js',
  'dist/scripts/upgrade-v16-to-v17.d.ts',
  'dist/scripts/migrations/v17.0.0/CheckpointMaterializationMigration.js',
  'scripts/hooks/post-merge.sh',
  'scripts/install-git-warp.sh',
  'scripts/uninstall-git-warp.sh',
  'docs/topics/README.md',
  'docs/operations/README.md',
  'docs/operations/package-payload.md',
  'docs/migrations/v19/README.md',
  'docs/READINGS_AND_OPTICS.md',
]);

const REQUIRED_PATH_SET = new Set(REQUIRED_PATHS);

const ALLOWED_PREFIXES = Object.freeze([
  'dist/src/',
  'dist/bin/',
  'dist/scripts/migrations/v17.0.0/',
  'dist/scripts/v18-to-v19/adapters/',
  'docs/topics/',
  'docs/operations/',
  'docs/migrations/v19/',
]);

const FORBIDDEN_PREFIXES = Object.freeze(['dist/scripts/v18-to-v19/performance/']);

export default class PackagePayloadPolicy {
  readonly maxPackedBytes = 1_200_000;
  readonly maxUnpackedBytes = 4_900_000;
  readonly maxEntryCount = 1_700;

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

  private allows(path: string): boolean {
    if (FORBIDDEN_PREFIXES.some((prefix) => path.startsWith(prefix))) {
      return false;
    }
    return (
      REQUIRED_PATH_SET.has(path) ||
      ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)) ||
      isDirectV18ToV19Artifact(path)
    );
  }
}

function isDirectV18ToV19Artifact(path: string): boolean {
  const prefix = 'dist/scripts/v18-to-v19/';
  if (!path.startsWith(prefix)) {
    return false;
  }
  const relativePath = path.slice(prefix.length);
  return (
    !relativePath.includes('/') &&
    (relativePath.endsWith('.js') || relativePath.endsWith('.d.ts'))
  );
}

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
