#!/usr/bin/env node
// SPDX-License-Identifier: Apache-2.0

import './RequireDockerTests.ts';

import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { availableParallelism, freemem, totalmem } from 'node:os';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import vitestConfig from '../vitest.config.ts';

import StableUnitTestPartition, { type UnitTestShard } from './StableUnitTestPartition.ts';

const BYTES_PER_MIB = 1024 * 1024;
const DEFAULT_MAX_WORKERS = 4;
const DEFAULT_MIN_FREE_MIB = 512;
const SUCCESS_EXIT_CODE = 0;
const FAILURE_EXIT_CODE = 1;
const ECHOED_LIST_OUTPUT_CHARS = 4096;
const MAX_LISTED_FILES = 20;
const TEST_FILE_PATTERN = /\.(?:test|spec|benchmark)\.(?:[cm][jt]s|[jt]sx?)$/;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const VITEST_ENTRY = join(ROOT, 'node_modules', 'vitest', 'vitest.mjs');
const VITEST_INCLUDE = (vitestConfig.test?.include ?? []).join(' and ');

const isTestFile = (fileName: string): boolean => TEST_FILE_PATTERN.test(fileName);

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

/** Reads an integer override with `Number.parseInt` (leading digits); no digits, or a value below `minimum`, stops the runner. */
function readIntAtLeast(name: string, fallback: number, minimum: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < minimum) {
    console.error(`stable-unit-tests: ${name} must be an integer of at least ${minimum}, got ${raw}`);
    process.exit(FAILURE_EXIT_CODE);
  }

  return parsed;
}

const readMebibytes = (name: string, actualBytes: number): number =>
  readIntAtLeast(name, actualBytes / BYTES_PER_MIB, 0) * BYTES_PER_MIB;

function detectWorkerCount(cpuCount: number): number {
  const defaultWorkers = Math.min(DEFAULT_MAX_WORKERS, Math.max(1, cpuCount - 1));
  return readIntAtLeast('WARP_TEST_MAX_WORKERS', defaultWorkers, 1);
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

  console.error('stable-unit-tests: BLOCKED: not enough free memory to spawn Vitest workers');
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

  return spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' }).status ?? FAILURE_EXIT_CODE;
}

/**
 * Test-only stand-in for the Vitest entry that `vitest list` runs. It is honoured only in dry run, so a real
 * run always asks the real Vitest which files it would run.
 */
function vitestListEntry(dryRun: boolean): string {
  const fake = process.env['WARP_TEST_FAKE_VITEST_LIST_ENTRY'];
  return dryRun && fake !== undefined ? fake : VITEST_ENTRY;
}

/** Vitest's own resolution of its include and exclude globs for `args`; stderr reaches the operator unchanged. */
function listVitestResolvedFiles(entry: string, args: readonly string[]): ReadonlySet<string> {
  const result = spawnSync(process.execPath, [entry, 'list', '--filesOnly', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  assertVitestListSucceeded(result);
  return new Set(result.stdout.split('\n').map((line) => line.trim()).filter((line) => line !== ''));
}

function vitestListFailure(result: SpawnSyncReturns<string>): string | undefined {
  if (result.error !== undefined) {
    return `failed: ${result.error.message}`;
  }
  if (result.signal !== null) {
    return `was killed by signal ${result.signal}`;
  }
  return result.status === SUCCESS_EXIT_CODE ? undefined : `exited ${String(result.status)}`;
}

function assertVitestListSucceeded(result: SpawnSyncReturns<string>): void {
  const failure = vitestListFailure(result);
  if (failure === undefined) {
    return;
  }

  process.stdout.write(`${(result.stdout ?? '').slice(-ECHOED_LIST_OUTPUT_CHARS)}\n`);
  console.error(`stable-unit-tests: BLOCKED: \`vitest list --filesOnly\` ${failure}`);
  console.error('  The runner could not learn which files Vitest runs, so no test ran.');
  console.error("  Vitest's own output is printed above. Fix that failure, then rerun.");
  process.exit(FAILURE_EXIT_CODE);
}

function blockOnFiles(headline: (count: number) => string, paths: readonly string[], guidance: readonly string[]): void {
  const unique = [...new Set(paths)];
  if (unique.length === 0) {
    return;
  }

  const shown = unique.slice(0, MAX_LISTED_FILES);
  const more = unique.length > shown.length ? [`...and ${unique.length - shown.length} more`] : [];
  console.error(`stable-unit-tests: BLOCKED: ${headline(unique.length)}`);
  for (const line of [...shown, ...more, ...guidance]) {
    console.error(`  ${line}`);
  }
  process.exit(FAILURE_EXIT_CODE);
}

const countFiles = (count: number, before: string, after: string): string =>
  `${count} ${before}${count === 1 ? 'file' : 'files'}${after} ${count === 1 ? 'is' : 'are'}`;

/** Fail closed when the partition selects a file that Vitest's include and exclude globs ignore. */
function assertVitestRunsSelection(paths: readonly string[], resolved: ReadonlySet<string>): void {
  blockOnFiles((count) => `${countFiles(count, 'selected ', '')} not run by Vitest:`,
    paths.filter((path) => !resolved.has(path)), [
      `vitest.config.ts includes only ${VITEST_INCLUDE}.`,
      'Rename or move each file to match, or delete it if it is not meant to run.',
    ]);
}

/** Fail closed when Vitest would run a unit test that the partition never selects. */
function assertRunnerSelectsRunnables(resolved: ReadonlySet<string>, selected: ReadonlySet<string>): void {
  const unselected = [...resolved].filter((path) => path.startsWith('test/unit/') && !selected.has(path));
  blockOnFiles((count) => `${countFiles(count, '', ' under test/unit/')} run by Vitest but never selected by the stable runner:`,
    unselected, [
      'The stable runner discovers only *.test.*, *.spec.* and *.benchmark.* names ending in .js, .jsx, .ts, .tsx,',
      '.mjs, .mts, .cjs or .cts, in real files under real directories.',
      'For another extension, rename the file to one of those.',
      'For a symlinked file or directory, replace the link with the real file or directory.',
    ]);
}

/** Mirrors Vitest's `filterFiles`: a lower-cased substring of a listed path, as typed or normalized from the root. */
function isUnmatchedTestName(filter: string, resolved: ReadonlySet<string>): boolean {
  const needles = [filter, relative(ROOT, resolve(ROOT, filter))].map((needle) => needle.toLowerCase());
  return isTestFile(basename(filter))
    && ![...resolved].some((path) => needles.some((needle) => path.toLowerCase().includes(needle)));
}

/** Fail closed on a `--` tail, on file filters that name a file Vitest ignores, and on unmatched test names. */
async function assertVitestRunsTargets(args: readonly string[], resolved: ReadonlySet<string>): Promise<void> {
  const tail = args.includes('--') ? args.slice(args.indexOf('--') + 1) : [];
  blockOnFiles((count) => `${count} ${count === 1 ? 'argument' : 'arguments'} after \`--\`, which Vitest does not use as a file filter:`,
    tail, ['Put each file or filter before `--`; with nothing before it, Vitest runs the whole suite.']);
  const { parseCLI } = await import('vitest/node');
  const filters = parseCLI(['vitest', 'run', ...args]).filter.map((filter) => ({
    filter, path: resolve(ROOT, filter), isFile: statSync(resolve(ROOT, filter), { throwIfNoEntry: false })?.isFile(),
  }));
  const unmatched = filters.filter((target) => target.isFile === undefined && isUnmatchedTestName(target.filter, resolved));
  blockOnFiles((count) => `${count} named test ${count === 1 ? 'file matches' : 'files match'} no file that Vitest runs:`,
    unmatched.map((target) => target.filter), ['Check the spelling and the path of each name.', `vitest.config.ts includes only ${VITEST_INCLUDE}.`]);
  const ignored = filters.filter((target) => target.isFile === true)
    .map((target) => relative(ROOT, target.path).split(sep).join('/')).filter((path) => !resolved.has(path));
  blockOnFiles((count) => `${countFiles(count, 'named ', '')} not run by Vitest:`, ignored, [
    `vitest.config.ts includes only ${VITEST_INCLUDE}.`,
    'Rename or move each file to match, or name a file that Vitest runs.',
  ]);
}

function runShard(shard: UnitTestShard, workers: number, dryRun: boolean): number {
  console.log(`stable-unit-tests: running shard ${shard.name} (${shard.paths.length} files)`);
  return runVitest(createVitestArgs(workers, shard.paths), dryRun);
}

function runTargeted(args: readonly string[], workers: number, dryRun: boolean): number {
  console.log('stable-unit-tests: running targeted bounded Vitest invocation');
  return runVitest(createVitestArgs(workers, args), dryRun);
}

const cpuCount = readIntAtLeast('WARP_TEST_FAKE_CPU_COUNT', availableParallelism(), 1);
const workers = detectWorkerCount(cpuCount);
const minFreeBytes = readIntAtLeast('WARP_TEST_MIN_FREE_MB', DEFAULT_MIN_FREE_MIB, 0) * BYTES_PER_MIB;
const freeBytes = readMebibytes('WARP_TEST_FAKE_FREE_MB', freemem());
const detectedTotalMemoryBytes = readMebibytes('WARP_TEST_FAKE_TOTAL_MB', totalmem());
const dryRun = process.env['WARP_STABLE_TEST_DRY_RUN'] === '1';
const vitestVersion = detectVitestVersion();

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
const resolvedFiles = listVitestResolvedFiles(vitestListEntry(dryRun), targetArgs);

if (targetArgs.length > 0) {
  await assertVitestRunsTargets(targetArgs, resolvedFiles);
  process.exit(runTargeted(targetArgs, workers, dryRun));
}

const partition = StableUnitTestPartition.fromInventory(listRecursiveTestFiles('test/unit'));
const selectedPaths = partition.shards.flatMap((shard) => shard.paths);
assertVitestRunsSelection(selectedPaths, resolvedFiles);
assertRunnerSelectsRunnables(resolvedFiles, new Set(selectedPaths));

// Shards run in order and the first failing exit code stops the rest.
process.exit(partition.shards.reduce((exitCode, shard) =>
  (exitCode === SUCCESS_EXIT_CODE ? runShard(shard, workers, dryRun) : exitCode), SUCCESS_EXIT_CODE));
