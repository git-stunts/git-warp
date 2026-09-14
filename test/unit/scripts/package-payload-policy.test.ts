import { describe, expect, it } from 'vitest';

import PackagePayloadEntry from '../../../scripts/package-payload/PackagePayloadEntry.ts';
import PackagePayloadError from '../../../scripts/package-payload/PackagePayloadError.ts';
import PackagePayloadInventory from '../../../scripts/package-payload/PackagePayloadInventory.ts';
import PackagePayloadPolicy from '../../../scripts/package-payload/PackagePayloadPolicy.ts';
import { decodeNpmPackInventory } from '../../../scripts/package-payload/adapters/NpmPackInventoryJsonAdapter.ts';

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

const OPTIONAL_ALLOWED_PATHS: readonly string[] = Object.freeze([
  'dist/src/RuntimeHelper.js',
  'dist/bin/RuntimeHelper.js',
  'dist/scripts/migrations/v17.0.0/RuntimeHelper.js',
  'dist/scripts/v18-to-v19/adapters/RuntimeAdapter.js',
  'docs/topics/runtime.md',
  'docs/operations/runtime.md',
  'docs/migrations/v19/runtime.md',
  'dist/scripts/v18-to-v19/RuntimeCommand.js',
  'dist/scripts/v18-to-v19/RuntimeCommand.d.ts',
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
      (path, index) => new PackagePayloadEntry(path, index === 0 ? 4_900_001 : 0)
    );
    const generatedEntries = Array.from(
      { length: 1_701 },
      (_, index) => new PackagePayloadEntry(`dist/src/generated/${String(index)}.js`, 0)
    );
    const entries = [...oversizedEntries, ...generatedEntries];
    const oversized = new PackagePayloadInventory(1_200_001, 4_900_001, entries);
    const assessment = new PackagePayloadPolicy().assess(oversized);

    expect(assessment.violations).toContain('compressed size 1200001 exceeds 1200000');
    expect(assessment.violations).toContain('unpacked size 4900001 exceeds 4900000');
    expect(assessment.violations).toContain(
      `entry count ${String(entries.length)} exceeds 1700`
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
