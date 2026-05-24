import { readFile, writeFile } from 'node:fs/promises';

import DryRunGraphModelMigrationPlanner
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlanner.ts';
import { parseGraphModelMigrationDryRunRequest }
  from '../../../../src/infrastructure/adapters/GraphModelMigrationDryRunRequestJsonAdapter.ts';
import { serializeGraphModelMigrationManifest }
  from '../../../../src/infrastructure/adapters/GraphModelMigrationManifestJsonAdapter.ts';
import type DryRunGraphModelMigrationPlan
  from '../../../../src/domain/migrations/DryRunGraphModelMigrationPlan.ts';
import type GraphModelMigrationNotice
  from '../../../../src/domain/migrations/GraphModelMigrationNotice.ts';

export class GraphModelMigrationDryRunCliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GraphModelMigrationDryRunCliArgumentError';
  }
}

export class GraphModelMigrationDryRunCliArgs {
  constructor(
    readonly requestPath: string | null,
    readonly manifestOutPath: string | null,
    readonly helpRequested: boolean,
  ) {
    Object.freeze(this);
  }
}

export class GraphModelMigrationDryRunCliResult {
  constructor(
    readonly exitCode: number,
    readonly stdout: string,
    readonly stderr: string,
  ) {
    Object.freeze(this);
  }
}

/** Returns CLI usage for the v18 graph-model migration dry-run. */
export function graphModelMigrationDryRunUsage(): string {
  return [
    'Usage:',
    '  node scripts/v18.0.0/migrations/graph-model/dry-run.ts --request <path> [--manifest-out <path>]',
    '',
    'Options:',
    '  --request <path>       JSON dry-run request to validate and plan.',
    '  --manifest-out <path>  Write the deterministic migration manifest to this path.',
    '  --dry-run              Accepted for explicitness; this command is always dry-run.',
    '  --help                 Show this help.',
  ].join('\n');
}

/** Parses dry-run CLI arguments without reading or writing files. */
export function parseGraphModelMigrationDryRunCliArgs(
  argv: readonly string[],
): GraphModelMigrationDryRunCliArgs {
  let requestPath: string | null = null;
  let manifestOutPath: string | null = null;
  let helpRequested = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--request') {
      requestPath = readArgValue(argv, index, '--request');
      index++;
      continue;
    }
    if (arg === '--manifest-out') {
      manifestOutPath = readArgValue(argv, index, '--manifest-out');
      index++;
      continue;
    }
    if (arg === '--dry-run') {
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      helpRequested = true;
      continue;
    }
    if (arg === '--apply' || arg === '--write' || arg === '--commit') {
      throw new GraphModelMigrationDryRunCliArgumentError(
        `${arg} is not supported; graph-model migration is dry-run only`,
      );
    }
    throw new GraphModelMigrationDryRunCliArgumentError(`Unknown argument: ${arg ?? ''}`);
  }

  return new GraphModelMigrationDryRunCliArgs(requestPath, manifestOutPath, helpRequested);
}

/** Runs the v18 graph-model migration dry-run command. */
export async function runGraphModelMigrationDryRunCli(
  argv: readonly string[],
): Promise<GraphModelMigrationDryRunCliResult> {
  const args = parseGraphModelMigrationDryRunCliArgs(argv);
  if (args.helpRequested) {
    return new GraphModelMigrationDryRunCliResult(0, `${graphModelMigrationDryRunUsage()}\n`, '');
  }
  if (args.requestPath === null) {
    throw new GraphModelMigrationDryRunCliArgumentError('--request is required');
  }

  const rawRequest = await readFile(args.requestPath, 'utf8');
  const request = parseGraphModelMigrationDryRunRequest(rawRequest);
  const plan = new DryRunGraphModelMigrationPlanner().plan(request);
  if (plan.hasFatalErrors()) {
    return new GraphModelMigrationDryRunCliResult(
      1,
      formatSummary(args, plan, 'not-written'),
      formatNotices(plan.fatalErrors),
    );
  }

  const manifest = plan.manifest;
  if (manifest === null) {
    throw new GraphModelMigrationDryRunCliArgumentError('successful dry-run plan did not include a manifest');
  }
  const manifestText = serializeGraphModelMigrationManifest(manifest);
  if (args.manifestOutPath !== null) {
    await writeFile(args.manifestOutPath, manifestText, 'utf8');
    return new GraphModelMigrationDryRunCliResult(
      0,
      formatSummary(args, plan, args.manifestOutPath),
      formatNotices(plan.warnings),
    );
  }
  return new GraphModelMigrationDryRunCliResult(
    0,
    `${formatSummary(args, plan, 'stdout')}\n${manifestText}`,
    formatNotices(plan.warnings),
  );
}

/** Reads an argument value from the next argv slot. */
function readArgValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw new GraphModelMigrationDryRunCliArgumentError(`${flag} requires a value`);
  }
  return value;
}

/** Formats deterministic dry-run summary lines. */
function formatSummary(
  args: GraphModelMigrationDryRunCliArgs,
  plan: DryRunGraphModelMigrationPlan,
  manifestTarget: string,
): string {
  return [
    'Graph model migration dry run',
    `request: ${args.requestPath ?? '(none)'}`,
    `manifest: ${manifestTarget}`,
    `plannedOperations: ${plan.plannedOperations.length}`,
    `warnings: ${plan.warnings.length}`,
    `fatalErrors: ${plan.fatalErrors.length}`,
    'graphHistoryWrites: 0',
  ].join('\n');
}

/** Formats warning or fatal notices for stderr. */
function formatNotices(notices: readonly GraphModelMigrationNotice[]): string {
  if (notices.length === 0) {
    return '';
  }
  return `${notices.map((notice) => `${notice.kind}[${notice.code}]: ${notice.message}`).join('\n')}\n`;
}
