#!/usr/bin/env node

import { progressBar, type BijouContext } from '@flyingrobots/bijou';
import { createNodeContext } from '@flyingrobots/bijou-node';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatFailure } from '../formatFailure.ts';
import { runV18MigrationApp } from './V18MigrationApp.ts';
import { runV18ToV19Migration, type V18MigrationCommandReport } from './V18MigrationCommand.ts';
import V18MigrationExecutionMode from './V18MigrationExecutionMode.ts';
import V18MigrationGraphCatalog from './V18MigrationGraphCatalog.ts';
import {
  formatV18MigrationPreflight,
  inspectV18MigrationPreflight,
} from './V18MigrationPreflight.ts';
import { type V18MigrationProgress, v18MigrationProgressPercent } from './V18MigrationProgress.ts';
import V18MigrationProgressCoalescer from './V18MigrationProgressCoalescer.ts';
import { formatV18MigrationReport } from './V18MigrationReport.ts';
import { createV18MigrationTheme } from './V18MigrationTheme.ts';

export type V18MigrationCliOptions = Readonly<{
  assumeYes: boolean;
  graph: string;
  json: boolean;
  mode: V18MigrationExecutionMode;
  recoveryId?: string;
  repositoryPath: string;
  scratchRoot?: string;
}>;

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(usage());
    return;
  }
  const options = parseV18MigrationCliOptions(process.argv.slice(2));
  const repositoryPath = resolve(options.repositoryPath);
  const catalog = await V18MigrationGraphCatalog.discover(repositoryPath);
  const graph = catalog.require(options.graph);
  const preflight = await inspectV18MigrationPreflight({
    repositoryPath,
    ...(options.scratchRoot === undefined ? {} : { scratchRoot: options.scratchRoot }),
  });
  const ctx = migrationContext();
  const passphrase = process.env['GIT_WARP_MIGRATION_PASSPHRASE'];
  const sharedOptions = {
    mode: options.mode,
    repositoryPath,
    ...(passphrase === undefined ? {} : { passphrase }),
    ...(options.recoveryId === undefined ? {} : { recoveryId: options.recoveryId }),
    ...(options.scratchRoot === undefined ? {} : { scratchRoot: options.scratchRoot }),
  };
  let report: V18MigrationCommandReport;
  let usedInteractiveApp = false;
  if (!options.assumeYes) {
    requireInteractiveConfirmation(catalog.summary());
    usedInteractiveApp = true;
    const result = await runV18MigrationApp({
      context: ctx,
      graph,
      preflight,
      ...sharedOptions,
    });
    if (result.status === 'cancelled') {
      process.stdout.write('v18-to-v19 migration cancelled; no refs changed\n');
      return;
    }
    if (result.status === 'failed') {
      throw result.error;
    }
    report = result.report;
  } else {
    process.stderr.write(`${catalog.summary()}\n${formatV18MigrationPreflight(preflight)}\n`);
    const progress = new V18MigrationProgressCoalescer((update) => {
      process.stderr.write(formatProgress(update, ctx));
    });
    try {
      report = await runV18ToV19Migration({
        ...sharedOptions,
        graph: options.graph,
        progress: (update) => progress.report(update),
      });
    } finally {
      progress.flush();
    }
  }
  if (usedInteractiveApp) {
    process.stderr.write(formatV18MigrationReport(report));
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }
  if (!usedInteractiveApp) {
    process.stdout.write(formatV18MigrationReport(report));
  }
}

function migrationContext(): BijouContext {
  return createNodeContext({
    nodeIO: {
      stderr: process.stderr,
      stdout: process.stderr,
    },
    theme: createV18MigrationTheme(),
  });
}

function requireInteractiveConfirmation(catalogSummary: string): void {
  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    process.stderr.write(`${catalogSummary}\n`);
    throw new Error(
      'confirmation requires an interactive terminal; inspect the graph list and rerun with --yes'
    );
  }
}

function formatProgress(progress: V18MigrationProgress, ctx: BijouContext): string {
  const writer = progress.writer === undefined ? '' : ` ${progress.writer}`;
  const count =
    progress.completed === undefined || progress.total === undefined
      ? ''
      : ` ${String(progress.completed)}/${String(progress.total)}`;
  const bar =
    progress.completed === undefined || progress.total === undefined
      ? ''
      : `\n  ${progressBar(v18MigrationProgressPercent(progress.completed, progress.total), {
          ctx,
          width: 28,
        })}`;
  return `v18-to-v19 [${progress.phase}]${writer}${count}: ${progress.message}${bar}\n`;
}

export function parseV18MigrationCliOptions(args: readonly string[]): V18MigrationCliOptions {
  let applySeen = false;
  let assumeYes = false;
  let dryRunSeen = false;
  let graph: string | null = null;
  let json = false;
  let mode = V18MigrationExecutionMode.promote();
  let recoveryId: string | undefined;
  let repositoryPath: string | null = null;
  let scratchRoot: string | undefined;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--apply') {
      applySeen = true;
    } else if (arg === '--dry-run') {
      dryRunSeen = true;
      mode = V18MigrationExecutionMode.rehearse();
    } else if (arg === '--yes') {
      assumeYes = true;
    } else if (arg === '--json') {
      json = true;
    } else if (arg === '--graph') {
      graph = requireValue(args, (index += 1), '--graph');
    } else if (arg === '--repo') {
      repositoryPath = requireValue(args, (index += 1), '--repo');
    } else if (arg === '--recovery-id') {
      recoveryId = requireValue(args, (index += 1), '--recovery-id');
    } else if (arg === '--scratch-root') {
      scratchRoot = requireValue(args, (index += 1), '--scratch-root');
    } else {
      throw new Error(`unknown argument: ${String(arg)}`);
    }
  }
  if (graph === null || repositoryPath === null) {
    throw new Error(`--repo and --graph are required\n\n${usage()}`);
  }
  if (applySeen && dryRunSeen) {
    throw new Error('--apply cannot be combined with --dry-run');
  }
  return Object.freeze({
    assumeYes,
    graph,
    json,
    mode,
    repositoryPath,
    ...(recoveryId === undefined ? {} : { recoveryId }),
    ...(scratchRoot === undefined ? {} : { scratchRoot }),
  });
}

function requireValue(args: readonly string[], index: number, option: string): string {
  const value = args[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${option} requires a value`);
  }
  return value;
}

function usage(): string {
  return [
    'Usage: git-warp-v18-to-v19 --repo <path> --graph <name> [options]',
    '',
    'Options:',
    '  --dry-run               Rehearse fully, then discard the verified scratch repo.',
    '  --yes                   Skip the interactive confirmation for automation.',
    '  --apply                 Compatibility alias for the default promotion mode.',
    '  --json                  Print the machine-readable report.',
    '  --recovery-id <token>   Stable recovery-ref suffix for operator tracking.',
    '  --scratch-root <path>    Place disposable repositories on this volume.',
    '  -h, --help              Show this help.',
    '',
    'The default is one pass: discover, confirm, rehearse, promote, and verify.',
    'Discovery lists every graph and whether it is current or needs an upgrade.',
    'A separate --dry-run is intentionally disposable and cannot be reused.',
    'For encrypted stores, set GIT_WARP_MIGRATION_PASSPHRASE in the environment.',
    '',
  ].join('\n');
}

if (isMainModule()) {
  main().catch((error: unknown) => {
    process.stderr.write(`git-warp-v18-to-v19: ${formatFailure(error)}\n`);
    process.exitCode = 1;
  });
}

function isMainModule(): boolean {
  const invokedPath = process.argv[1];
  if (invokedPath === undefined) {
    return false;
  }
  const resolvedPath = resolve(invokedPath);
  try {
    return import.meta.url === pathToFileURL(realpathSync(resolvedPath)).href;
  } catch {
    return import.meta.url === pathToFileURL(resolvedPath).href;
  }
}
