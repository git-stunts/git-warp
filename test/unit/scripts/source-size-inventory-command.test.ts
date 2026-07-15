import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  SOURCE_SIZE_RELAXATIONS,
  checkSourceSizeGate,
  collectSourceSizeInventory,
} from '../../../scripts/source-size-gate.ts';

const SOURCE_FILE_LOC_CEILING = 500;
const TEST_FILE_LOC_CEILING = 800;
const TOOLING_FILE_LOC_CEILING = 300;

const SOURCE_OVER_BUDGET_PATHS = Object.freeze([
  'src/domain/RuntimeHost.ts',
  'src/domain/orset/trie/TrieCursor.ts',
  'src/domain/services/JoinReducerSession.ts',
  'src/domain/services/controllers/CheckpointController.ts',
  'src/domain/services/optic/CheckpointBasisManifest.ts',
  'src/domain/services/state/WarpState.ts',
]);

const TOOLING_OVER_BUDGET_PATHS = Object.freeze([
  'bin/cli/commands/doctor/checks.ts',
  'bin/cli/commands/seek.ts',
  'bin/cli/infrastructure.ts',
  'scripts/check-dts-surface.ts',
  'scripts/contamination-map.ts',
  'scripts/dead-export-report.ts',
  'scripts/issue-triage-report.ts',
  'scripts/lint-semgrep-with-quarantines.ts',
  'scripts/release-guard.sh',
  'scripts/v18.0.0/migrations/graph-model/V17GoldenGraphFixtureManifest.ts',
]);

const STRAND_SERVICE_TEST_PATH = 'test/unit/domain/services/strand/StrandService.test.ts';
const tempDirs: string[] = [];

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop() ?? '', { force: true, recursive: true });
  }
});

function createTempRepo(): string {
  const root = mkdtempSync(join(tmpdir(), 'git-warp-source-size-'));
  tempDirs.push(root);
  for (const directory of ['src', 'bin', 'scripts', 'test/unit', 'test/conformance']) {
    mkdirSync(join(root, directory), { recursive: true });
  }
  return root;
}

function writeLines(root: string, path: string, lines: number): void {
  mkdirSync(join(root, path, '..'), { recursive: true });
  writeFileSync(join(root, path), Array.from({ length: lines }, (_, index) => `line ${index}`).join('\n'));
}

describe('source size gate', () => {
  it('reports the current source files over the 500 LOC ceiling as explicit relaxations', () => {
    const report = checkSourceSizeGate();
    const sourceOverBudget = report.entries
      .filter((entry) => entry.band === 'source' && entry.lines > SOURCE_FILE_LOC_CEILING)
      .map((entry) => entry.path);

    expect(sourceOverBudget).toEqual(SOURCE_OVER_BUDGET_PATHS);
    expect(report.violations).toEqual([]);
    expect(report.staleRelaxations).toEqual([]);
  });

  it('keeps tooling overages visible against the 300 LOC ceiling', () => {
    const entries = collectSourceSizeInventory();
    const toolingOverBudget = entries
      .filter((entry) => entry.band === 'tooling' && entry.lines > TOOLING_FILE_LOC_CEILING)
      .map((entry) => entry.path);

    expect(toolingOverBudget).toEqual(TOOLING_OVER_BUDGET_PATHS);
  });

  it('keeps test-file overages visible as inventory, not closeout prose', () => {
    const entries = collectSourceSizeInventory();
    const strandServiceTest = entries.find((entry) => entry.path === STRAND_SERVICE_TEST_PATH);

    expect(strandServiceTest?.lines).toBeGreaterThan(TEST_FILE_LOC_CEILING);
    expect(SOURCE_SIZE_RELAXATIONS).toContain(STRAND_SERVICE_TEST_PATH);
  });

  it('fails new over-budget files and stale relaxations', () => {
    const root = createTempRepo();
    writeLines(root, 'src/new-god.ts', SOURCE_FILE_LOC_CEILING + 1);
    writeLines(root, 'bin/tool.ts', TOOLING_FILE_LOC_CEILING);
    writeLines(root, 'test/unit/small.test.ts', TEST_FILE_LOC_CEILING);

    const report = checkSourceSizeGate(root);

    expect(report.violations.map((entry) => entry.path)).toEqual(['src/new-god.ts']);
    expect(report.staleRelaxations).toEqual([...SOURCE_SIZE_RELAXATIONS].sort());
  });
});
