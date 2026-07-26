#!/usr/bin/env node

import { runV18ToV19Migration } from './V18MigrationCommand.ts';
import type { V18MigrationProgress } from './V18MigrationProgress.ts';

type CliOptions = Readonly<{
  apply: boolean;
  graph: string;
  json: boolean;
  recoveryId?: string;
  repositoryPath: string;
  scratchRoot?: string;
}>;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const passphrase = process.env['GIT_WARP_MIGRATION_PASSPHRASE'];
  const report = await runV18ToV19Migration({
    apply: options.apply,
    graph: options.graph,
    progress: (progress) => {
      process.stderr.write(formatProgress(progress));
    },
    repositoryPath: options.repositoryPath,
    ...(passphrase === undefined ? {} : { passphrase }),
    ...(options.recoveryId === undefined ? {} : { recoveryId: options.recoveryId }),
    ...(options.scratchRoot === undefined ? {} : { scratchRoot: options.scratchRoot }),
  });
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  process.stdout.write(formatReport(report));
}

function formatProgress(progress: V18MigrationProgress): string {
  const writer = progress.writer === undefined ? '' : ` ${progress.writer}`;
  const count = progress.completed === undefined || progress.total === undefined
    ? ''
    : ` ${String(progress.completed)}/${String(progress.total)}`;
  return `v18-to-v19 [${progress.phase}]${writer}${count}: ${progress.message}\n`;
}

function parseArgs(args: readonly string[]): CliOptions {
  let apply = false;
  let graph: string | null = null;
  let json = false;
  let recoveryId: string | undefined;
  let repositoryPath: string | null = null;
  let scratchRoot: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      apply = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--graph') {
      graph = requireValue(args, index += 1, '--graph');
    } else if (arg === '--repo') {
      repositoryPath = requireValue(args, index += 1, '--repo');
    } else if (arg === '--recovery-id') {
      recoveryId = requireValue(args, index += 1, '--recovery-id');
    } else if (arg === '--scratch-root') {
      scratchRoot = requireValue(args, index += 1, '--scratch-root');
    } else if (arg === '--help' || arg === '-h') {
      process.stdout.write(usage());
      process.exit(0);
    } else {
      throw new Error(`unknown argument: ${String(arg)}`);
    }
  }
  if (graph === null || repositoryPath === null) {
    throw new Error(`--repo and --graph are required\n\n${usage()}`);
  }
  return Object.freeze({
    apply,
    graph,
    json,
    repositoryPath,
    ...(recoveryId === undefined ? {} : { recoveryId }),
    ...(scratchRoot === undefined ? {} : { scratchRoot }),
  });
}

function requireValue(
  args: readonly string[],
  index: number,
  option: string,
): string {
  const value = args[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function formatReport(
  report: Awaited<ReturnType<typeof runV18ToV19Migration>>,
): string {
  const lines = [
    `v18-to-v19 retained-substrate migration: ${report.status}`,
    `repository: ${report.plan.repositoryPath}`,
    `graph: ${report.plan.graph}`,
    `writers: ${String(report.plan.writers.length)}`,
    `scratch verified: ${report.scratchVerified ? 'yes' : 'no'}`,
  ];
  if (report.finalization !== null) {
    lines.push(`recovery refs: ${report.finalization.recoveryPrefix}`);
  }
  if (report.status === 'verified-dry-run') {
    lines.push('no authoritative refs changed; rerun with --apply to promote');
  }
  return `${lines.join('\n')}\n`;
}

function usage(): string {
  return [
    'Usage: git-warp-v18-to-v19 --repo <path> --graph <name> [options]',
    '',
    'Options:',
    '  --apply                 Atomically promote the scratch-verified migration.',
    '  --json                  Print the machine-readable report.',
    '  --recovery-id <token>   Stable recovery-ref suffix for operator tracking.',
    '  --scratch-root <path>    Place disposable repositories on this volume.',
    '  -h, --help              Show this help.',
    '',
    'Without --apply, the command performs the complete disposable proof only.',
    'For encrypted stores, set GIT_WARP_MIGRATION_PASSPHRASE in the environment.',
    '',
  ].join('\n');
}

main().catch((error: unknown) => {
  process.stderr.write(`git-warp-v18-to-v19: ${formatFailure(error)}\n`);
  process.exitCode = 1;
});

function formatFailure(error: unknown, seen = new Set<unknown>()): string {
  if (seen.has(error)) {
    return '[circular failure]';
  }
  seen.add(error);
  const message = error instanceof Error ? error.message : String(error);
  const nested: string[] = [];
  if (error instanceof AggregateError) {
    error.errors.forEach((entry, index) => {
      nested.push(`failure ${String(index + 1)}: ${formatFailure(entry, seen)}`);
    });
  }
  if (error instanceof Error && error.cause !== undefined) {
    nested.push(`cause: ${formatFailure(error.cause, seen)}`);
  }
  return nested.length === 0 ? message : `${message}\n${nested.join('\n')}`;
}
