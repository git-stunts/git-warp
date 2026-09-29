import { describe, expect, it } from 'vitest';

import PackagePayloadEntry from '../../../scripts/package-payload/PackagePayloadEntry.ts';
import PackagePayloadError from '../../../scripts/package-payload/PackagePayloadError.ts';
import PackagePayloadInventory from '../../../scripts/package-payload/PackagePayloadInventory.ts';
import PackagePayloadPolicy from '../../../scripts/package-payload/PackagePayloadPolicy.ts';
import { decodeNpmPackInventory } from '../../../scripts/package-payload/adapters/NpmPackInventoryJsonAdapter.ts';

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

const OPTIONAL_ALLOWED_PATHS: readonly string[] = Object.freeze([
  'dist/src/RuntimeHelper.js',
  'dist/bin/RuntimeHelper.js',
  'dist/scripts/migrations/v17.0.0/RuntimeHelper.js',
  'dist/scripts/v18-to-v19/adapters/RuntimeAdapter.js',
  'dist/scripts/v18-to-v19/RuntimeCommand.js',
  'dist/src/RuntimeHelper.d.ts',
]);

// Executable implementation publishes JavaScript only. No public declaration
// reaches these declarations, and no other file type belongs there either.
const EXCLUDED_IMPLEMENTATION_ARTIFACTS: readonly string[] = Object.freeze([
  'dist/bin/git-warp.d.ts',
  'dist/bin/cli/commands/doctor/index.d.ts',
  'dist/scripts/v18-to-v19/migrate.d.ts',
  'dist/scripts/v18-to-v19/adapters/RuntimeAdapter.d.ts',
  'dist/scripts/formatFailure.d.ts',
  'dist/scripts/upgrade-v16-to-v17.d.ts',
  'dist/scripts/migrations/v17.0.0/CheckpointMaterializationMigration.d.ts',
  'dist/bin/cli/commands/doctor/index.js.map',
]);

const WITHHELD_DOCUMENTATION_PATHS: readonly string[] = Object.freeze([
  'CHANGELOG.md',
  'docs/topics/README.md',
  'docs/topics/api/README.md',
  'docs/topics/v19-1-performance-architecture-witness.md',
  'docs/operations/README.md',
  'docs/operations/package-payload.md',
  'docs/migrations/v19/runtime.md',
  'docs/ANTI_SLUDGE_POLICY.md',
]);

function inventory(paths: readonly string[], packedBytes = 100): PackagePayloadInventory {
  const entries = paths.map((path) => new PackagePayloadEntry(path, 1));
  return new PackagePayloadInventory(packedBytes, entries.length, entries);
}

describe('package payload policy', () => {
  it('accepts the complete supported artifact within its reviewed ceilings', () => {
    const assessment = new PackagePayloadPolicy().assess(inventory(REQUIRED_PATHS));

    expect(assessment.isAccepted()).toBe(true);
    expect(assessment.violations).toEqual([]);
  });

  it.each(OPTIONAL_ALLOWED_PATHS)('accepts supported optional path %s', (path) => {
    const assessment = new PackagePayloadPolicy().assess(
      inventory([...REQUIRED_PATHS, path])
    );

    expect(assessment.isAccepted()).toBe(true);
    expect(assessment.violations).toEqual([]);
  });

  it.each(WITHHELD_DOCUMENTATION_PATHS)('rejects withheld documentation path %s', (path) => {
    const assessment = new PackagePayloadPolicy().assess(
      inventory([...REQUIRED_PATHS, path])
    );

    expect(assessment.isAccepted()).toBe(false);
    expect(assessment.violations).toEqual([`unexpected published path: ${path}`]);
  });

  it.each(EXCLUDED_IMPLEMENTATION_ARTIFACTS)(
    'rejects non-JavaScript executable implementation path %s',
    (path) => {
      const assessment = new PackagePayloadPolicy().assess(
        inventory([...REQUIRED_PATHS, path])
      );

      expect(assessment.isAccepted()).toBe(false);
      expect(assessment.violations).toEqual([`unexpected published path: ${path}`]);
    }
  );

  it('accepts an artifact exactly at every geometry ceiling', () => {
    const policy = new PackagePayloadPolicy();
    const filler = Array.from(
      { length: policy.maxEntryCount - REQUIRED_PATHS.length },
      (_, index) => new PackagePayloadEntry(`dist/src/generated/${String(index)}.js`, 0)
    );
    const required = REQUIRED_PATHS.map(
      (path, index) => new PackagePayloadEntry(path, index === 0 ? policy.maxUnpackedBytes : 0)
    );
    const atCeiling = new PackagePayloadInventory(policy.maxPackedBytes, policy.maxUnpackedBytes, [
      ...required,
      ...filler,
    ]);

    expect(policy.assess(atCeiling).violations).toEqual([]);
  });

  it('reports unexpected paths and missing required paths together', () => {
    const paths = [
      ...REQUIRED_PATHS.slice(1),
      'dist/scripts/issue-triage-report.js',
      'dist/scripts/v18-to-v19/performance/RunMigratedReadPerformance.js',
      'dist/scripts/v18-to-v19/private/UndeclaredMaintainerTool.js',
    ];
    const assessment = new PackagePayloadPolicy().assess(inventory(paths));

    expect(assessment.isAccepted()).toBe(false);
    expect(assessment.violations).toContain(
      'unexpected published path: dist/scripts/issue-triage-report.js'
    );
    expect(assessment.violations).toContain(
      'unexpected published path: dist/scripts/v18-to-v19/performance/RunMigratedReadPerformance.js'
    );
    expect(assessment.violations).toContain(
      'unexpected published path: dist/scripts/v18-to-v19/private/UndeclaredMaintainerTool.js'
    );
    expect(assessment.violations).toContain('required path is missing: package.json');
  });

  it('reports every exceeded geometry ceiling', () => {
    const oversizedEntries = REQUIRED_PATHS.map(
      (path, index) => new PackagePayloadEntry(path, index === 0 ? 3_300_001 : 0)
    );
    const generatedEntries = Array.from(
      { length: 1_051 },
      (_, index) => new PackagePayloadEntry(`dist/src/generated/${String(index)}.js`, 0)
    );
    const entries = [...oversizedEntries, ...generatedEntries];
    const oversized = new PackagePayloadInventory(760_001, 3_300_001, entries);
    const assessment = new PackagePayloadPolicy().assess(oversized);

    expect(assessment.violations).toContain('compressed size 760001 exceeds 760000');
    expect(assessment.violations).toContain('unpacked size 3300001 exceeds 3300000');
    expect(assessment.violations).toContain(
      `entry count ${String(entries.length)} exceeds 1050`
    );
  });
});

describe('npm pack inventory boundary', () => {
  it('constructs a validated runtime inventory from npm JSON', () => {
    const decoded = decodeNpmPackInventory(
      '[{"size":2,"unpackedSize":2,"entryCount":2,"files":[{"path":"README.md","size":1},{"path":"LICENSE","size":1}]}]'
    );

    expect(decoded.packedBytes).toBe(2);
    expect(decoded.unpackedBytes).toBe(2);
    expect(decoded.entryCount).toBe(2);
    expect(decoded.entries.map((entry) => entry.path)).toEqual(['README.md', 'LICENSE']);
  });

  it('accepts a terminal npm inventory after npm 10 prepare output', () => {
    const decoded = decodeNpmPackInventory(
      'prepare output\n[{' +
        '"size":1,"unpackedSize":1,"entryCount":1,' +
        '"files":[{"path":"README.md","size":1}]}]\n'
    );

    expect(decoded.entries.map((entry) => entry.path)).toEqual(['README.md']);
  });

  it('rejects malformed JSON and inconsistent npm counts', () => {
    expect(() => decodeNpmPackInventory('not-json')).toThrow(PackagePayloadError);
    expect(() =>
      decodeNpmPackInventory(
        'prepare output\n' +
          '[{"size":1,"unpackedSize":1,"entryCount":1,' +
          '"files":[{"path":"README.md","size":1}]}]\ntrailing output'
      )
    ).toThrow(PackagePayloadError);
    expect(() =>
      decodeNpmPackInventory(
        '[{"size":1,"unpackedSize":1,"entryCount":2,"files":[{"path":"README.md","size":1}]}]'
      )
    ).toThrow(PackagePayloadError);
  });

  it('rejects invalid entries, duplicate paths, and inconsistent unpacked size', () => {
    expect(() => new PackagePayloadEntry('../escape', 1)).toThrow(PackagePayloadError);
    expect(() => new PackagePayloadEntry('README.md', -1)).toThrow(PackagePayloadError);
    expect(
      () =>
        new PackagePayloadInventory(1, 2, [
          new PackagePayloadEntry('README.md', 1),
          new PackagePayloadEntry('README.md', 1),
        ])
    ).toThrow(PackagePayloadError);
    expect(
      () => new PackagePayloadInventory(1, 2, [new PackagePayloadEntry('README.md', 1)])
    ).toThrow(PackagePayloadError);
  });
});
