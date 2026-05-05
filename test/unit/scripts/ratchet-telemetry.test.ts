import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildSnapshotPath } from '../../../scripts/ratchet/buildSnapshotPath.ts';
import { createSnapshot } from '../../../scripts/ratchet/createSnapshot.ts';
import { diffSnapshots } from '../../../scripts/ratchet/diffSnapshots.ts';
import { extractEslintCounts } from '../../../scripts/ratchet/extractEslintCounts.ts';
import { extractTypecheckErrorCount } from '../../../scripts/ratchet/extractTypecheckErrorCount.ts';
import { extractVitestCounts } from '../../../scripts/ratchet/extractVitestCounts.ts';
import { formatDelta } from '../../../scripts/ratchet/formatDelta.ts';
import { listSnapshotPaths } from '../../../scripts/ratchet/listSnapshotPaths.ts';
import { readSnapshot } from '../../../scripts/ratchet/readSnapshot.ts';
import { sanitizeBranchName } from '../../../scripts/ratchet/sanitizeBranchName.ts';
import { writeSnapshot } from '../../../scripts/ratchet/writeSnapshot.ts';

describe('ratchet telemetry', () => {
  it('counts TypeScript errors from compiler output', () => {
    expect(extractTypecheckErrorCount([
      'src/a.ts(1,1): error TS1005: ; expected',
      'src/b.ts(2,2): error TS2339: property missing',
    ].join('\n'))).toBe(2);
  });

  it('sums eslint errors and warnings from json output', () => {
    expect(extractEslintCounts(JSON.stringify([
      { errorCount: 1, fatalErrorCount: 0, warningCount: 2 },
      { errorCount: 0, fatalErrorCount: 1, warningCount: 3 },
    ]))).toEqual({ errors: 2, warnings: 5 });
  });

  it('rejects malformed eslint json', () => {
    expect(() => extractEslintCounts('{')).toThrow('Invalid eslint JSON');
  });

  it('extracts vitest summary counts from json output', () => {
    expect(extractVitestCounts(JSON.stringify({
      numTotalTests: 10,
      numPassedTests: 9,
      numFailedTests: 1,
      numTotalTestSuites: 3,
      numFailedTestSuites: 1,
    }))).toEqual({
      total: 10,
      passed: 9,
      failed: 1,
      suites: 3,
      failedSuites: 1,
    });
  });

  it('rejects malformed vitest summaries', () => {
    expect(() => extractVitestCounts('[]')).toThrow('Invalid vitest summary');
  });

  it('sanitizes cycle branches into filesystem-safe directory names', () => {
    expect(sanitizeBranchName('cycle/0013-typescript-migration')).toBe('0013-typescript-migration');
    expect(sanitizeBranchName('feat/agent dx')).toBe('feat-agent-dx');
  });

  it('builds snapshot paths under the branch directory', () => {
    expect(buildSnapshotPath({
      outputRoot: 'docs/method/ratchet',
      branch: 'cycle/0013-typescript-migration',
      label: 'abc12345',
    })).toBe('docs/method/ratchet/0013-typescript-migration/abc12345.json');
  });

  it('writes and reads back validated snapshots', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'git-warp-ratchet-'));
    const snapshot = createSnapshot({
      branch: 'cycle/0013-typescript-migration',
      baseRef: 'main',
      mergeBase: 'base',
      commit: 'aaa',
      label: 'aaa11111',
      capturedAt: '2026-04-09T00:00:00.000Z',
      typecheckErrors: 1462,
      lintErrors: 0,
      lintWarnings: 0,
      testsPassed: 6797,
      testsFailed: 0,
      testSuites: 394,
      failedSuites: 0,
    });
    const path = join(outputRoot, 'snapshot.json');

    await writeSnapshot(path, snapshot);

    await expect(readSnapshot(path)).resolves.toEqual(snapshot);
  });

  it('rejects malformed snapshot files', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'git-warp-ratchet-'));
    const path = join(outputRoot, 'broken.json');
    await writeFile(path, JSON.stringify({
      branch: 'cycle/0013-typescript-migration',
      baseRef: 'main',
      mergeBase: 'base',
      commit: 'aaa',
      label: 'aaa11111',
      capturedAt: '2026-04-09T00:00:00.000Z',
      metrics: { typecheckErrors: 10 },
    }), 'utf8');

    await expect(readSnapshot(path)).rejects.toThrow('Invalid snapshot');
  });

  it('lists branch snapshot files in sorted order and ignores non-json files', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'git-warp-ratchet-'));
    const branchDir = join(outputRoot, '0013-typescript-migration');
    await mkdir(branchDir, { recursive: true });
    await writeFile(join(branchDir, 'b.json'), '{}', 'utf8');
    await writeFile(join(branchDir, 'a.json'), '{}', 'utf8');
    await writeFile(join(branchDir, 'notes.txt'), 'ignore me', 'utf8');

    await expect(listSnapshotPaths({
      outputRoot,
      branch: 'cycle/0013-typescript-migration',
    })).resolves.toEqual([
      join(branchDir, 'a.json'),
      join(branchDir, 'b.json'),
    ]);
  });

  it('returns an empty snapshot list when the branch directory is missing', async () => {
    const outputRoot = await mkdtemp(join(tmpdir(), 'git-warp-ratchet-'));

    await expect(listSnapshotPaths({
      outputRoot,
      branch: 'cycle/does-not-exist',
    })).resolves.toEqual([]);
  });

  it('diffs snapshots and formats a readable delta', () => {
    const fromSnapshot = createSnapshot({
      branch: 'cycle/0013-typescript-migration',
      baseRef: 'main',
      mergeBase: 'base',
      commit: 'aaa',
      label: 'aaa11111',
      capturedAt: '2026-04-09T00:00:00.000Z',
      typecheckErrors: 1462,
      lintErrors: 0,
      lintWarnings: 0,
      testsPassed: 6797,
      testsFailed: 0,
      testSuites: 394,
      failedSuites: 0,
    });
    const toSnapshot = createSnapshot({
      branch: 'cycle/0013-typescript-migration',
      baseRef: 'main',
      mergeBase: 'base',
      commit: 'bbb',
      label: 'bbb22222',
      capturedAt: '2026-04-09T01:00:00.000Z',
      typecheckErrors: 1450,
      lintErrors: 0,
      lintWarnings: 0,
      testsPassed: 6802,
      testsFailed: 0,
      testSuites: 394,
      failedSuites: 0,
    });

    const delta = diffSnapshots(fromSnapshot, toSnapshot);
    expect(delta.deltas['typecheckErrors']).toBe(-12);
    expect(delta.deltas['testsPassed']).toBe(5);
    expect(formatDelta(delta)).toContain('typecheckErrors: -12');
    expect(formatDelta(delta)).toContain('testsPassed: +5');
  });
});
