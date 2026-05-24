import { readFile, writeFile } from 'node:fs/promises';

import GenesisEquivalenceComparisonBasis
  from '../../../../src/domain/migrations/GenesisEquivalenceComparisonBasis.ts';
import V17GoldenGraphFixtureGenesisReading
  from '../../../../src/domain/migrations/V17GoldenGraphFixtureGenesisReading.ts';
import DryRunGraphModelMigrationPlanner
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanner.ts';
import { parseGraphModelMigrationDryRunRequest }
  from '../../../../src/infrastructure/adapters/GraphModelMigrationDryRunRequestJsonAdapter.ts';
import { parseV17GoldenGraphFixtureManifestJson }
  from '../../../../src/infrastructure/adapters/V17GoldenGraphFixtureManifestJsonAdapter.ts';
import { runGraphModelMigrationCommand } from './GraphModelMigrationCommand.ts';
import { formatGraphModelMigrationCommandReport } from './GraphModelMigrationCommandReport.ts';
import { buildGraphModelMigrationScratchReading } from './GraphModelMigrationScratchReadingBuilder.ts';
import type DryRunGraphModelMigrationPlan
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlan.ts';
import type GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';

const FINALIZATION_FLAGS = Object.freeze(new Set([
  '--finalize',
  '--live-ref',
  '--archive-ref',
  '--expected-live-head',
  '--confirmation',
]));

export class GraphModelMigrationCommandCliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationCommandCliArgumentError';
  }
}

export class GraphModelMigrationCommandCliArgs {
  readonly repositoryPath: string | null;
  readonly requestPath: string | null;
  readonly legacyFixtureManifestPath: string | null;
  readonly scratchRefName: string | null;
  readonly reportOutPath: string | null;
  readonly helpRequested: boolean;

  constructor(options: {
    readonly repositoryPath: string | null;
    readonly requestPath: string | null;
    readonly legacyFixtureManifestPath: string | null;
    readonly scratchRefName: string | null;
    readonly reportOutPath: string | null;
    readonly helpRequested: boolean;
  }) {
    this.repositoryPath = options.repositoryPath;
    this.requestPath = options.requestPath;
    this.legacyFixtureManifestPath = options.legacyFixtureManifestPath;
    this.scratchRefName = options.scratchRefName;
    this.reportOutPath = options.reportOutPath;
    this.helpRequested = options.helpRequested;
    Object.freeze(this);
  }
}

export class GraphModelMigrationCommandCliResult {
  constructor(
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    Object.freeze(this);
  }
}

/** Returns CLI usage for the v18 graph-model migration command wrapper. */
export function graphModelMigrationCommandUsage(): string {
  return [
    'Usage:',
    [
      '  node scripts/v18.0.0/migrations/graph-model/migrate.ts',
      '--repo <path>',
      '--request <path>',
      '--legacy-fixture-manifest <path>',
      '--scratch-ref <ref>',
      '[--report-out <path>]',
    ].join(' '),
    '',
    'Options:',
    '  --repo <path>                     Git repository to receive scratch migration history.',
    '  --request <path>                  JSON migration request to validate and execute.',
    '  --legacy-fixture-manifest <path>  V17 fixture manifest used for legacy equivalence reading.',
    '  --scratch-ref <ref>               refs/warp-migration-scratch/* target for scratch output.',
    '  --report-out <path>               Also write the deterministic command report to this path.',
    '  --help                           Show this help.',
    '',
    'Finalization flags are intentionally refused by this wrapper until live-ref CLI finalization is designed.',
  ].join('\n');
}

/** Parses command CLI arguments without reading or writing files. */
export function parseGraphModelMigrationCommandCliArgs(
  argv: readonly string[],
): GraphModelMigrationCommandCliArgs {
  let repositoryPath: string | null = null;
  let requestPath: string | null = null;
  let legacyFixtureManifestPath: string | null = null;
  let scratchRefName: string | null = null;
  let reportOutPath: string | null = null;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--repo') {
      repositoryPath = readArgValue(argv, index, '--repo');
      index++;
      continue;
    }
    if (arg === '--request') {
      requestPath = readArgValue(argv, index, '--request');
      index++;
      continue;
    }
    if (arg === '--legacy-fixture-manifest') {
      legacyFixtureManifestPath = readArgValue(argv, index, '--legacy-fixture-manifest');
      index++;
      continue;
    }
    if (arg === '--scratch-ref') {
      scratchRefName = readArgValue(argv, index, '--scratch-ref');
      index++;
      continue;
    }
    if (arg === '--report-out') {
      reportOutPath = readArgValue(argv, index, '--report-out');
      index++;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      helpRequested = true;
      continue;
    }
    if (arg !== undefined && FINALIZATION_FLAGS.has(arg)) {
      throw new GraphModelMigrationCommandCliArgumentError(
        'finalization is not supported by this CLI wrapper yet',
      );
    }
    throw new GraphModelMigrationCommandCliArgumentError(`Unknown argument: ${arg ?? ''}`);
  }

  return new GraphModelMigrationCommandCliArgs({
    repositoryPath,
    requestPath,
    legacyFixtureManifestPath,
    scratchRefName,
    reportOutPath,
    helpRequested,
  });
}

/** Runs the v18 graph-model migration command wrapper. */
export async function runGraphModelMigrationCommandCli(
  argv: readonly string[],
): Promise<GraphModelMigrationCommandCliResult> {
  const args = parseGraphModelMigrationCommandCliArgs(argv);
  if (args.helpRequested) {
    return new GraphModelMigrationCommandCliResult(0, `${graphModelMigrationCommandUsage()}\n`, '');
  }
  requireCommandArgs(args);

  const requestText = await readFile(requireString(args.requestPath, '--request'), 'utf8');
  const legacyManifestText = await readFile(
    requireString(args.legacyFixtureManifestPath, '--legacy-fixture-manifest'),
    'utf8',
  );
  const dryRunRequest = parseGraphModelMigrationDryRunRequest(requestText);
  const legacyManifest = parseV17GoldenGraphFixtureManifestJson(legacyManifestText);
  const preflightPlan = new DryRunGraphModelMigrationPlanner().plan(dryRunRequest);
  if (preflightPlan.hasFatalErrors() || preflightPlan.manifest === null) {
    return new GraphModelMigrationCommandCliResult(1, preflightFailureReport(preflightPlan), '');
  }

  const repositoryPath = requireString(args.repositoryPath, '--repo');
  const scratchRefName = requireString(args.scratchRefName, '--scratch-ref');
  const result = await runGraphModelMigrationCommand({
    repositoryPath,
    dryRunRequest,
    scratchRefName,
    equivalenceBasis: new GenesisEquivalenceComparisonBasis({
      legacyBasis: preflightPlan.manifest.sourceBasis,
      migratedBasis: preflightPlan.manifest.targetBasis,
    }),
    legacyReading: null,
    scratchReading: null,
    readingProviders: {
      legacyReading: async () => new V17GoldenGraphFixtureGenesisReading().build(legacyManifest),
      scratchReading: async () => await buildGraphModelMigrationScratchReading({
        repositoryPath,
        scratchRefName,
        readingId: 'scratch:command-cli',
      }),
    },
    finalization: null,
  });
  const report = formatGraphModelMigrationCommandReport(result);
  if (args.reportOutPath !== null) {
    await writeFile(args.reportOutPath, report, 'utf8');
  }
  return new GraphModelMigrationCommandCliResult(commandExitCode(result), report, '');
}

function commandExitCode(result: Awaited<ReturnType<typeof runGraphModelMigrationCommand>>): number {
  if (
    !result.dryRunPlan.hasFatalErrors()
    && !result.loweringResult.hasFatalErrors()
    && result.scratchWriteResult !== null
    && !result.scratchWriteResult.hasFatalErrors()
    && result.gateResult !== null
    && result.gateResult.allowsPromotion()
  ) {
    return 0;
  }
  return 1;
}

function preflightFailureReport(plan: DryRunGraphModelMigrationPlan): string {
  return [
    'git-warp v18 graph-model migration report',
    'dryRun: blocked',
    `plannedOperations: ${plan.plannedOperations.length}`,
    ...fatalNoticeLines(plan.fatalErrors),
  ].join('\n');
}

function fatalNoticeLines(fatalErrors: readonly GraphModelMigrationNotice[]): readonly string[] {
  const lines = ['fatalErrors:'];
  for (const notice of fatalErrors) {
    lines.push(`- ${notice.code}: ${notice.message}`);
  }
  return Object.freeze(lines);
}

function requireCommandArgs(args: GraphModelMigrationCommandCliArgs): void {
  requireString(args.repositoryPath, '--repo');
  requireString(args.requestPath, '--request');
  requireString(args.legacyFixtureManifestPath, '--legacy-fixture-manifest');
  requireString(args.scratchRefName, '--scratch-ref');
}

function requireString(value: string | null, flag: string): string {
  if (value === null) {
    throw new GraphModelMigrationCommandCliArgumentError(`${flag} is required`);
  }
  return value;
}

function readArgValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new GraphModelMigrationCommandCliArgumentError(`${flag} requires a value`);
  }
  return value;
}
