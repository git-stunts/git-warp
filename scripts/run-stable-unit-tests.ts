#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { availableParallelism, freemem, totalmem } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type Shard = {
  readonly name: string;
  readonly paths: readonly string[];
};

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_MAX_WORKERS = 4;
const DEFAULT_MIN_FREE_MIB = 512;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const TEST_FILE_PATTERN = /\.(?:test|spec|benchmark)\.(?:[cm][jt]s|[jt]sx?)$/;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST_ENTRY = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');

function isTestFile(fileName: string): boolean {
  return TEST_FILE_PATTERN.test(fileName);
}

function listDirectTestFiles(relativeDirectory: string): string[] {
  return readdirSync(join(ROOT, relativeDirectory), { withFileTypes: true })
    .filter((entry) => entry.isFile() && isTestFile(entry.name))
    .map((entry) => `${relativeDirectory}/${entry.name}`)
    .sort();
}

function listRecursiveTestFiles(relativeDirectory: string): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(join(ROOT, relativeDirectory), { withFileTypes: true })) {
    const relativePath = `${relativeDirectory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...listRecursiveTestFiles(relativePath));
    } else if (entry.isFile() && isTestFile(entry.name)) {
      files.push(relativePath);
    }
  }

  return files.sort();
}

const UNIT_SHARDS: readonly Shard[] = [
  {
    name: 'unit-small-surfaces',
    paths: [
      ...listDirectTestFiles('test/unit'),
      ...listRecursiveTestFiles('test/unit/benchmark'),
      ...listRecursiveTestFiles('test/unit/boundary'),
      ...listRecursiveTestFiles('test/unit/cli'),
      ...listRecursiveTestFiles('test/unit/helpers'),
      ...listRecursiveTestFiles('test/unit/ports'),
      ...listRecursiveTestFiles('test/unit/security'),
      ...listRecursiveTestFiles('test/unit/specs'),
    ],
  },
  {
    name: 'unit-infrastructure',
    paths: listRecursiveTestFiles('test/unit/infrastructure'),
  },
  {
    name: 'unit-scripts',
    paths: listRecursiveTestFiles('test/unit/scripts'),
  },
  {
    name: 'unit-domain-core',
    paths: [
      ...listDirectTestFiles('test/unit/domain'),
      ...listRecursiveTestFiles('test/unit/domain/artifacts'),
      ...listRecursiveTestFiles('test/unit/domain/capabilities'),
      ...listRecursiveTestFiles('test/unit/domain/continuum'),
      ...listRecursiveTestFiles('test/unit/domain/crdt'),
      ...listRecursiveTestFiles('test/unit/domain/entities'),
      ...listRecursiveTestFiles('test/unit/domain/errors'),
      ...listRecursiveTestFiles('test/unit/domain/graph'),
      ...listRecursiveTestFiles('test/unit/domain/memory'),
      ...listRecursiveTestFiles('test/unit/domain/migrations'),
      ...listRecursiveTestFiles('test/unit/domain/orset'),
      ...listRecursiveTestFiles('test/unit/domain/properties'),
      ...listRecursiveTestFiles('test/unit/domain/stream'),
      ...listRecursiveTestFiles('test/unit/domain/tree'),
      ...listRecursiveTestFiles('test/unit/domain/trust'),
      ...listRecursiveTestFiles('test/unit/domain/types'),
      ...listRecursiveTestFiles('test/unit/domain/utils'),
      ...listRecursiveTestFiles('test/unit/domain/warp'),
    ],
  },
  {
    name: 'unit-domain-services-root',
    paths: listDirectTestFiles('test/unit/domain/services'),
  },
  {
    name: 'unit-domain-services-subdirs',
    paths: [
      ...listRecursiveTestFiles('test/unit/domain/services/controllers'),
      ...listRecursiveTestFiles('test/unit/domain/services/optic'),
      ...listRecursiveTestFiles('test/unit/domain/services/query'),
      ...listRecursiveTestFiles('test/unit/domain/services/snapshot'),
      ...listRecursiveTestFiles('test/unit/domain/services/state'),
      ...listRecursiveTestFiles('test/unit/domain/services/strand'),
      ...listRecursiveTestFiles('test/unit/domain/services/sync'),
    ],
  },
];

function assertUniqueShardPaths(shards: readonly Shard[]): void {
  const seen = new Set<string>();
  for (const shard of shards) {
    for (const path of shard.paths) {
      if (seen.has(path)) {
        console.error(`stable-unit-tests: duplicate shard path ${path}`);
        process.exit(FAILURE_EXIT_CODE);
      }
      seen.add(path);
    }
  }
}

function readPositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    console.error(`stable-unit-tests: ${name} must be a positive integer, got ${raw}`);
    process.exit(FAILURE_EXIT_CODE);
  }

  return parsed;
}

function readNonNegativeInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    console.error(`stable-unit-tests: ${name} must be a non-negative integer, got ${raw}`);
    process.exit(FAILURE_EXIT_CODE);
  }

  return parsed;
}

function readMemoryBytes(fakeEnvName: string, actualBytes: number): number {
  const raw = process.env[fakeEnvName];
  if (raw === undefined || raw.trim() === '') {
    return actualBytes;
  }

  const mib = Number.parseInt(raw, 10);
  if (!Number.isFinite(mib) || mib < 0) {
    console.error(`stable-unit-tests: ${fakeEnvName} must be a non-negative MiB integer, got ${raw}`);
    process.exit(FAILURE_EXIT_CODE);
  }

  return mib * BYTES_PER_MIB;
}

function detectCpuCount(): number {
  const fakeCpuCount = process.env['WARP_TEST_FAKE_CPU_COUNT'];
  if (fakeCpuCount !== undefined && fakeCpuCount.trim() !== '') {
    return readPositiveInt('WARP_TEST_FAKE_CPU_COUNT', 1);
  }

  return availableParallelism();
}

function detectWorkerCount(cpuCount: number): number {
  const defaultWorkers = Math.min(DEFAULT_MAX_WORKERS, Math.max(1, cpuCount - 1));
  return readPositiveInt('WARP_TEST_MAX_WORKERS', defaultWorkers);
}

function detectVitestVersion(): string {
  const packagePath = join(ROOT, 'node_modules', 'vitest', 'package.json');
  const packageJson = readFileSync(packagePath, 'utf8');
  const match = /"version"\s*:\s*"([^"]+)"/.exec(packageJson);
  return match?.[1] ?? 'unknown';
}

function formatMib(bytes: number): string {
  return (bytes / BYTES_PER_MIB).toFixed(0);
}

function printRunnerFacts(options: {
  readonly cpuCount: number;
  readonly freeBytes: number;
  readonly minFreeBytes: number;
  readonly totalBytes: number;
  readonly vitestVersion: string;
  readonly workers: number;
}): void {
  console.log('stable-unit-tests: runner facts');
  console.log(`  node: ${process.version}`);
  console.log(`  vitest: ${options.vitestVersion}`);
  console.log(`  cpu count: ${options.cpuCount}`);
  console.log(`  max workers: ${options.workers}`);
  console.log(`  free memory: ${formatMib(options.freeBytes)} MiB`);
  console.log(`  total memory: ${formatMib(options.totalBytes)} MiB`);
  console.log(`  minimum free memory: ${formatMib(options.minFreeBytes)} MiB`);
}

function assertMemoryPreflight(freeBytes: number, minFreeBytes: number): void {
  if (freeBytes >= minFreeBytes) {
    return;
  }

  console.error('stable-unit-tests: BLOCKED before spawning Vitest workers');
  console.error(`  free memory: ${formatMib(freeBytes)} MiB`);
  console.error(`  required free memory: ${formatMib(minFreeBytes)} MiB`);
  console.error('  close other processes or lower WARP_TEST_MIN_FREE_MB with an explicit operator decision');
  process.exit(FAILURE_EXIT_CODE);
}

function createVitestArgs(workers: number, paths: readonly string[]): string[] {
  return [VITEST_ENTRY, 'run', '--maxWorkers', workers.toString(), ...paths];
}

function runVitest(args: readonly string[], dryRun: boolean): number {
  const commandPreview = ['node', ...args].join(' ');

  if (dryRun) {
    console.log(`stable-unit-tests: dry-run ${commandPreview}`);
    return SUCCESS_EXIT_CODE;
  }

  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    stdio: 'inherit',
  });

  if (typeof result.status === 'number') {
    return result.status;
  }

  return FAILURE_EXIT_CODE;
}

function runShard(shard: Shard, workers: number, dryRun: boolean): number {
  console.log(`stable-unit-tests: running shard ${shard.name} (${shard.paths.length} files)`);
  return runVitest(createVitestArgs(workers, shard.paths), dryRun);
}

function runTargeted(args: readonly string[], workers: number, dryRun: boolean): number {
  console.log('stable-unit-tests: running targeted bounded Vitest invocation');
  return runVitest(createVitestArgs(workers, args), dryRun);
}

const cpuCount = detectCpuCount();
const workers = detectWorkerCount(cpuCount);
const minFreeBytes = readNonNegativeInt('WARP_TEST_MIN_FREE_MB', DEFAULT_MIN_FREE_MIB) * BYTES_PER_MIB;
const freeBytes = readMemoryBytes('WARP_TEST_FAKE_FREE_MB', freemem());
const detectedTotalMemoryBytes = readMemoryBytes('WARP_TEST_FAKE_TOTAL_MB', totalmem());
const dryRun = process.env['WARP_STABLE_TEST_DRY_RUN'] === '1';
const vitestVersion = detectVitestVersion();

assertUniqueShardPaths(UNIT_SHARDS);

printRunnerFacts({
  cpuCount,
  freeBytes,
  minFreeBytes,
  totalBytes: detectedTotalMemoryBytes,
  vitestVersion,
  workers,
});

assertMemoryPreflight(freeBytes, minFreeBytes);

const targetArgs = process.argv.slice(2);

if (targetArgs.length > 0) {
  process.exit(runTargeted(targetArgs, workers, dryRun));
}

for (const shard of UNIT_SHARDS) {
  const exitCode = runShard(shard, workers, dryRun);
  if (exitCode !== SUCCESS_EXIT_CODE) {
    process.exit(exitCode);
  }
}

process.exit(SUCCESS_EXIT_CODE);
