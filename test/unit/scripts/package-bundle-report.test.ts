import { expect, it } from 'vitest';
import packageBundleReport from '../../../scripts/package-payload/PackageBundleReport.ts';
import PackagePayloadEntry from '../../../scripts/package-payload/PackagePayloadEntry.ts';
import PackagePayloadInventory from '../../../scripts/package-payload/PackagePayloadInventory.ts';
import PackagePayloadPolicy from '../../../scripts/package-payload/PackagePayloadPolicy.ts';

const policy = new PackagePayloadPolicy();
const REQUIRED_PATHS = [
  'package.json', 'README.md', 'LICENSE', 'NOTICE',
  'dist/index.js', 'dist/index.d.ts', 'dist/advanced.js', 'dist/advanced.d.ts',
  'dist/diagnostics.js', 'dist/diagnostics.d.ts', 'dist/charts.js', 'dist/charts.d.ts',
  'dist/testing.js', 'dist/testing.d.ts', 'dist/bin/git-warp.js', 'bin/git-warp',
  'dist/scripts/v18-to-v19/migrate.js', 'dist/scripts/formatFailure.js',
  'dist/scripts/upgrade-v16-to-v17.js',
  'dist/scripts/migrations/v17.0.0/CheckpointMaterializationMigration.js',
  'scripts/hooks/post-merge.sh', 'scripts/install-git-warp.sh', 'scripts/uninstall-git-warp.sh',
  'docs/migrations/v19/README.md', 'docs/READINGS_AND_OPTICS.md',
];

it('reports no findings for a complete artifact with no advisory warnings', () => {
  const entries = REQUIRED_PATHS.map((path) => new PackagePayloadEntry(path, 0));
  expect(packageBundleReport(new PackagePayloadInventory(0, 0, entries), policy, []))
    .toContain('No static inspection findings.');
});

it.each([
  [0.84, 'OK'], [0.85, 'Approaching limit'], [0.95, 'Critical headroom'], [1, 'Critical headroom'], [1.01, 'Limit exceeded'],
])('reports exact compressed usage at %s', (ratio, assessment) => {
  const packed = Math.round(policy.maxPackedBytes * ratio);
  const report = packageBundleReport(new PackagePayloadInventory(packed, 0, []), policy, []);
  expect(report).toContain(`| Compressed bytes | ${packed} | 760000 | ${(ratio * 100).toFixed(1)}% | ${Math.max(0, 760000 - packed)} |`);
  expect(report.split('\n').find((line) => line.startsWith('| Compressed bytes'))).toContain(assessment);
  expect(report).not.toContain('NaN');
});

it('shows largest files deterministically, preserves measurements, and bounds unsafe text', () => {
  const entries = [...REQUIRED_PATHS.map((path) => new PackagePayloadEntry(path, 0)), new PackagePayloadEntry('dist/src/b.js', 100), new PackagePayloadEntry('dist/src/a.js', 100),
    new PackagePayloadEntry('dist/src/type.d.ts', 50), new PackagePayloadEntry('<tag>|`file\n.md', 25)];
  const inventory = new PackagePayloadInventory(80, 275, entries);
  const report = packageBundleReport(inventory, policy, Array.from({ length: 30 }, () => '<bad>|`\n' + 'x'.repeat(500)));
  const largest = report.slice(report.indexOf('#### Largest files'));
  expect(largest.indexOf('dist/src/a.js')).toBeLessThan(largest.indexOf('dist/src/b.js')); 
  expect(report).toContain('| JavaScript | 200 |');
  expect(report).toContain('| Declarations | 50 |');
  expect(report).toContain('| Metadata, documentation, and assets | 25 |');
  expect(report).toContain('additional findings');
  expect(report).not.toContain('<tag>');
  expect(report).not.toContain('x'.repeat(300));
  expect(report).toContain('&#124;');
});
