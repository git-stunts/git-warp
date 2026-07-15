#!/usr/bin/env node

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export type SourceSizeBand = 'source' | 'test' | 'tooling';

export type SourceSizeInventoryEntry = {
  readonly path: string;
  readonly lines: number;
  readonly band: SourceSizeBand;
  readonly ceiling: number;
  readonly relaxed: boolean;
};

export type SourceSizeGateReport = {
  readonly entries: readonly SourceSizeInventoryEntry[];
  readonly violations: readonly SourceSizeInventoryEntry[];
  readonly staleRelaxations: readonly string[];
};

const ROOT = dirname(fileURLToPath(new URL('../package.json', import.meta.url)));
const SOURCE_FILE_LOC_CEILING = 500;
const TEST_FILE_LOC_CEILING = 800;
const TOOLING_FILE_LOC_CEILING = 300;
const SCAN_ROOTS = Object.freeze([
  'src',
  'bin',
  'scripts',
  'test/unit',
  'test/conformance',
]);

export const SOURCE_SIZE_RELAXATIONS = Object.freeze([
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
  'src/domain/RuntimeHost.ts',
  'src/domain/orset/trie/TrieCursor.ts',
  'src/domain/services/JoinReducerSession.ts',
  'src/domain/services/controllers/CheckpointController.ts',
  'src/domain/services/optic/CheckpointBasisManifest.ts',
  'src/domain/services/state/WarpState.ts',
  'test/unit/domain/WarpGraph.coverageGaps.test.ts',
  'test/unit/domain/services/CommitDagTraversalService.test.ts',
  'test/unit/domain/services/GraphTraversal.test.ts',
  'test/unit/domain/services/IncrementalIndexUpdater.test.ts',
  'test/unit/domain/services/JoinReducer.integration.test.ts',
  'test/unit/domain/services/JoinReducer.test.ts',
  'test/unit/domain/services/SyncAuthService.test.ts',
  'test/unit/domain/services/SyncController.test.ts',
  'test/unit/domain/services/SyncProtocol.test.ts',
  'test/unit/domain/services/WormholeService.test.ts',
  'test/unit/domain/services/controllers/ComparisonController.test.ts',
  'test/unit/domain/services/controllers/MaterializeController.test.ts',
  'test/unit/domain/services/controllers/PatchController.test.ts',
  'test/unit/domain/services/controllers/QueryController.test.ts',
  'test/unit/domain/services/controllers/SyncController.test.ts',
  'test/unit/domain/services/strand/ConflictAnalyzerService.test.ts',
  'test/unit/domain/services/strand/StrandService.test.ts',
  'test/unit/infrastructure/adapters/GitTrieStoreAdapter.test.ts',
  'test/unit/scripts/visible-state-upgrade.test.ts',
  'test/unit/specs/audit-receipt-vectors.test.ts',
]);

const SOURCE_SIZE_RELAXATION_SET = new Set(SOURCE_SIZE_RELAXATIONS);

function shouldScanFile(path: string): boolean {
  return path.endsWith('.ts') || path.endsWith('.js') || path.endsWith('.sh');
}

function collectFiles(root: string, relativeDirectory: string): readonly string[] {
  const absoluteDirectory = join(root, relativeDirectory);
  const files: string[] = [];

  for (const entry of readdirSync(absoluteDirectory)) {
    if (entry === 'node_modules' || entry === 'dist') {
      continue;
    }
    const absolutePath = join(absoluteDirectory, entry);
    const relativePath = relative(root, absolutePath);
    if (statSync(absolutePath).isDirectory()) {
      files.push(...collectFiles(root, relativePath));
      continue;
    }
    if (shouldScanFile(relativePath)) {
      files.push(relativePath);
    }
  }

  return files;
}

function classifyPath(path: string): { readonly band: SourceSizeBand; readonly ceiling: number } {
  if (path.startsWith('src/')) {
    return { band: 'source', ceiling: SOURCE_FILE_LOC_CEILING };
  }
  if (path.startsWith('test/')) {
    return { band: 'test', ceiling: TEST_FILE_LOC_CEILING };
  }
  return { band: 'tooling', ceiling: TOOLING_FILE_LOC_CEILING };
}

function countLines(root: string, path: string): number {
  return readFileSync(join(root, path), 'utf8').split('\n').length;
}

export function collectSourceSizeInventory(root: string = ROOT): readonly SourceSizeInventoryEntry[] {
  return SCAN_ROOTS
    .flatMap((scanRoot) => collectFiles(root, scanRoot))
    .sort()
    .map((path) => {
      const classification = classifyPath(path);
      return {
        path,
        lines: countLines(root, path),
        band: classification.band,
        ceiling: classification.ceiling,
        relaxed: SOURCE_SIZE_RELAXATION_SET.has(path),
      };
    });
}

export function checkSourceSizeGate(root: string = ROOT): SourceSizeGateReport {
  const entries = collectSourceSizeInventory(root);
  const overBudget = entries.filter((entry) => entry.lines > entry.ceiling);
  const violations = overBudget.filter((entry) => !entry.relaxed);
  const overBudgetPaths = new Set(overBudget.map((entry) => entry.path));
  const staleRelaxations = SOURCE_SIZE_RELAXATIONS
    .filter((path) => !overBudgetPaths.has(path))
    .sort();

  return Object.freeze({
    entries,
    violations,
    staleRelaxations,
  });
}

function formatEntry(entry: SourceSizeInventoryEntry): string {
  return `${entry.path}: ${entry.lines}/${entry.ceiling} LOC (${entry.band})`;
}

export function runSourceSizeGate(root: string = ROOT): number {
  const report = checkSourceSizeGate(root);
  if (report.violations.length === 0 && report.staleRelaxations.length === 0) {
    console.log('source-size gate passed');
    return 0;
  }

  if (report.violations.length > 0) {
    console.error('source-size gate failed: new over-budget files');
    for (const violation of report.violations) {
      console.error(`  ${formatEntry(violation)}`);
    }
  }

  if (report.staleRelaxations.length > 0) {
    console.error('source-size gate failed: stale relaxation entries');
    for (const path of report.staleRelaxations) {
      console.error(`  ${path}`);
    }
  }

  return 1;
}

const invokedPath = process.argv[1];
if (invokedPath !== undefined && import.meta.url === pathToFileURL(invokedPath).href) {
  process.exitCode = runSourceSizeGate();
}
