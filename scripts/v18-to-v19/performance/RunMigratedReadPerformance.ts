import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  evaluateMigratedReadPerformance,
} from './GateMigratedReadPerformance.ts';
import {
  migratedReadEnvironment,
  prepareMigratedReadSeeds,
} from './MigratedReadPerformanceFixture.ts';
import {
  MIGRATED_READ_SCHEMA_VERSION,
  type MigratedReadPerformancePolicy,
  MigratedReadPerformancePolicySchema,
  MigratedReadPerformanceReportSchema,
  type MigratedReadRuntime,
  type MigratedReadSample,
} from './MigratedReadPerformanceModel.ts';
import {
  runMigratedReadProcess,
} from './MigratedReadPerformanceProcess.ts';
import {
  summarizeMigratedReadRuntime,
} from './MigratedReadPerformanceStatistics.ts';
import {
  renderMigratedReadPerformanceSummary,
} from './MigratedReadPerformanceSummary.ts';

type RunOptions = Readonly<{
  fixturePackage: string;
  manifestPath: string;
  measuredRuns: number;
  outputPath: string;
  policyPath: string;
  projectRoot: string;
  warmupRuns: number;
}>;

export async function runMigratedReadPerformance(
  options: RunOptions,
): Promise<ReturnType<typeof MigratedReadPerformanceReportSchema.parse>> {
  const temporaryRoot = await mkdtemp(
    join(tmpdir(), 'git-warp-migrated-comparison-'),
  );
  try {
    const seeds = await prepareMigratedReadSeeds({
      manifestPath: options.manifestPath,
      root: temporaryRoot,
    });
    const policy = await readPolicy(options.policyPath);
    const samples: MigratedReadSample[] = [];
    const executionOrder: Array<Readonly<{
      measured: boolean;
      round: number;
      runtime: MigratedReadRuntime;
    }>> = [];
    const totalRounds = options.warmupRuns + options.measuredRuns;
    for (let round = 0; round < totalRounds; round += 1) {
      const measured = round >= options.warmupRuns;
      for (const runtime of runtimeOrder(round)) {
        executionOrder.push(Object.freeze({ measured, round, runtime }));
        const pair = await runColdWarmPair({
          fixturePackage: options.fixturePackage,
          root: temporaryRoot,
          round,
          runtime,
          seed: runtime === 'v18'
            ? seeds.v18Repository
            : seeds.v19Repository,
        });
        if (measured) {
          samples.push(...pair);
        }
      }
    }
    const runtimes = Object.freeze({
      v18: summarizeMigratedReadRuntime('v18', samples),
      v19: summarizeMigratedReadRuntime('v19', samples),
    });
    const failures = evaluateMigratedReadPerformance(
      runtimes.v18,
      runtimes.v19,
      policy,
    );
    return MigratedReadPerformanceReportSchema.parse({
      environment: await migratedReadEnvironment(options),
      executionOrder,
      failures,
      fixture: {
        bundleBytes: seeds.bundleBytes,
        fixtureId: 'v18-retained-substrate-medium-001',
        graph: seeds.graph,
        patchCount: seeds.patchCount,
      },
      generatedAt: new Date().toISOString(),
      measuredRuns: options.measuredRuns,
      migration: {
        status: 'migrated',
        wallMs: seeds.migrationWallMs,
      },
      policy,
      result: failures.length === 0 ? 'PASS' : 'FAIL',
      runtimes,
      schemaVersion: MIGRATED_READ_SCHEMA_VERSION,
      warmupRuns: options.warmupRuns,
    });
  } finally {
    await rm(temporaryRoot, { force: true, recursive: true });
  }
}

async function runColdWarmPair(options: Readonly<{
  fixturePackage: string;
  root: string;
  round: number;
  runtime: MigratedReadRuntime;
  seed: string;
}>): Promise<readonly MigratedReadSample[]> {
  const repositoryPath = join(
    options.root,
    `sample-${String(options.round)}-${options.runtime}`,
  );
  await cp(options.seed, repositoryPath, { recursive: true });
  const cold = await runMigratedReadProcess({
    fixturePackage: options.fixturePackage,
    repositoryPath,
    runtime: options.runtime,
    scenario: 'cold',
  });
  const warm = await runMigratedReadProcess({
    fixturePackage: options.fixturePackage,
    repositoryPath,
    runtime: options.runtime,
    scenario: 'warm',
  });
  return Object.freeze([cold, warm]);
}

function runtimeOrder(round: number): readonly MigratedReadRuntime[] {
  return round % 2 === 0
    ? ['v19', 'v18']
    : ['v18', 'v19'];
}

async function readPolicy(
  path: string,
): Promise<MigratedReadPerformancePolicy> {
  return MigratedReadPerformancePolicySchema.parse(
    JSON.parse(await readFile(path, 'utf8')) as unknown,
  );
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const report = await runMigratedReadPerformance(options);
  const summary = renderMigratedReadPerformanceSummary(report);
  const summaryPath = join(dirname(options.outputPath), 'summary.md');
  await mkdir(dirname(options.outputPath), { recursive: true });
  await writeFile(
    options.outputPath,
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(summaryPath, summary);
  process.stdout.write(summary);
  process.stdout.write(`\nReport: ${options.outputPath}\n`);
  if (report.result === 'FAIL') {
    process.exitCode = 1;
  }
}

function parseOptions(args: readonly string[]): RunOptions {
  const projectRoot = fileURLToPath(new URL('../../../../', import.meta.url));
  return Object.freeze({
    fixturePackage: option(
      args,
      '--fixture-package',
      join(projectRoot, 'fixtures/v18/retained-substrate-medium'),
    ),
    manifestPath: option(
      args,
      '--manifest',
      join(
        projectRoot,
        'fixtures/v18/retained-substrate-medium/manifest.json',
      ),
    ),
    measuredRuns: positiveInteger(
      process.env['GIT_WARP_MIGRATED_READ_RUNS'],
      5,
    ),
    outputPath: resolve(option(
      args,
      '--output',
      join(projectRoot, '.performance/migrated-read/report.json'),
    )),
    policyPath: option(
      args,
      '--policy',
      join(projectRoot, 'benchmarks/v19/migrated-read-policy.json'),
    ),
    projectRoot,
    warmupRuns: nonNegativeInteger(
      process.env['GIT_WARP_MIGRATED_READ_WARMUPS'],
      1,
    ),
  });
}

function option(
  args: readonly string[],
  name: string,
  fallback: string,
): string {
  const index = args.indexOf(name);
  const value = index < 0 ? undefined : args[index + 1];
  return value === undefined ? fallback : resolve(value);
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = nonNegativeInteger(value, fallback);
  if (parsed === 0) {
    throw new Error('measured runs must be positive');
  }
  return parsed;
}

function nonNegativeInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`invalid run count: ${String(value)}`);
  }
  return parsed;
}

function isMainModule(): boolean {
  return process.argv[1] !== undefined
    && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  await main();
}
