#!/usr/bin/env node

import { progressBar, type BijouContext } from '@flyingrobots/bijou';
import { createNodeContext } from '@flyingrobots/bijou-node';
import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import { formatFailure } from '../formatFailure.ts';
import { runV18MigrationApp } from './V18MigrationApp.ts';
import { runV18ToV19Migration, type V18MigrationCommandReport } from './V18MigrationCommand.ts';
import type V18MigrationGraph from './V18MigrationGraph.ts';
import V18MigrationGraphCatalog from './V18MigrationGraphCatalog.ts';
import {
  formatV18MigrationPreflight,
  inspectV18MigrationPreflight,
  type V18MigrationPreflight,
} from './V18MigrationPreflight.ts';
import { type V18MigrationProgress, v18MigrationProgressPercent } from './V18MigrationProgress.ts';
import V18MigrationProgressCoalescer from './V18MigrationProgressCoalescer.ts';
import { formatV18MigrationReport } from './V18MigrationReport.ts';
import { createV18MigrationTheme } from './V18MigrationTheme.ts';
import { V18_MIGRATION_CLI_FLAGS } from './V18MigrationCliContract.ts';
import { formatV18MigrationCliHelp } from './V18MigrationCliHelp.ts';
import {
  isV18MigrationCliHelpRequest,
  parseV18MigrationCliOptions,
  type V18MigrationCliOptions,
} from './V18MigrationCliOptions.ts';
import { requireV18MigrationRepository } from './V18MigrationRepository.ts';

type V18MigrationTarget = Readonly<{
  catalog: V18MigrationGraphCatalog;
  graph: V18MigrationGraph;
  preflight: V18MigrationPreflight;
  repositoryPath: string;
}>;

/** A finished run, or null when the operator cancelled before any ref changed. */
type V18MigrationRun = Readonly<{ interactive: boolean; report: V18MigrationCommandReport }> | null;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (isV18MigrationCliHelpRequest(args)) {
    process.stdout.write(formatV18MigrationCliHelp());
    return;
  }
  const options = parseV18MigrationCliOptions(args);
  const target = await discoverTarget(options);
  const run = options.assumeYes
    ? await runAutomated(options, target)
    : await runInteractive(options, target);
  if (run !== null) {
    writeReport(options, run);
  }
}

async function discoverTarget(options: V18MigrationCliOptions): Promise<V18MigrationTarget> {
  const repositoryPath = resolve(options.repositoryPath);
  await requireV18MigrationRepository(repositoryPath);
  const catalog = await V18MigrationGraphCatalog.discover(repositoryPath);
  const graph = catalog.require(options.graph);
  const preflight = await inspectV18MigrationPreflight({
    repositoryPath,
    ...(options.scratchRoot === undefined ? {} : { scratchRoot: options.scratchRoot }),
  });
  return Object.freeze({ catalog, graph, preflight, repositoryPath });
}

function sharedOptions(options: V18MigrationCliOptions, repositoryPath: string) {
  const passphrase = process.env['GIT_WARP_MIGRATION_PASSPHRASE'];
  return {
    mode: options.mode,
    repositoryPath,
    ...(passphrase === undefined ? {} : { passphrase }),
    ...(options.recoveryId === undefined ? {} : { recoveryId: options.recoveryId }),
    ...(options.scratchRoot === undefined ? {} : { scratchRoot: options.scratchRoot }),
  };
}

async function runInteractive(
  options: V18MigrationCliOptions,
  target: V18MigrationTarget
): Promise<V18MigrationRun> {
  requireInteractiveConfirmation(target.catalog.summary());
  const result = await runV18MigrationApp({
    context: migrationContext(),
    graph: target.graph,
    preflight: target.preflight,
    ...sharedOptions(options, target.repositoryPath),
  });
  if (result.status === 'cancelled') {
    process.stdout.write('v18-to-v19 migration cancelled; no refs changed\n');
    return null;
  }
  if (result.status === 'failed') {
    throw result.error;
  }
  return Object.freeze({ interactive: true, report: result.report });
}

async function runAutomated(
  options: V18MigrationCliOptions,
  target: V18MigrationTarget
): Promise<V18MigrationRun> {
  process.stderr.write(`${target.catalog.summary()}\n${formatV18MigrationPreflight(target.preflight)}\n`);
  const ctx = migrationContext();
  const progress = new V18MigrationProgressCoalescer((update) => {
    process.stderr.write(formatProgress(update, ctx));
  });
  try {
    const report = await runV18ToV19Migration({
      ...sharedOptions(options, target.repositoryPath),
      graph: options.graph,
      progress: (update) => progress.report(update),
    });
    return Object.freeze({ interactive: false, report });
  } finally {
    progress.flushBestEffort();
  }
}

/** The interactive app owns the terminal, so its durable report goes to stderr. */
function writeReport(options: V18MigrationCliOptions, run: NonNullable<V18MigrationRun>): void {
  if (run.interactive) {
    process.stderr.write(formatV18MigrationReport(run.report));
  }
  if (options.json) {
    process.stdout.write(`${JSON.stringify(run.report, null, 2)}\n`);
  } else if (!run.interactive) {
    process.stdout.write(formatV18MigrationReport(run.report));
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
      `confirmation requires an interactive terminal; inspect the graph list and rerun with ${V18_MIGRATION_CLI_FLAGS.yes.name}`
    );
  }
}

function formatProgress(progress: V18MigrationProgress, ctx: BijouContext): string {
  const writer = progress.writer === undefined ? '' : ` ${progress.writer}`;
  const completion = formatCompletion(progress, ctx);
  return `v18-to-v19 [${progress.phase}]${writer}${completion.count}: ${progress.message}${completion.bar}\n`;
}

function formatCompletion(
  progress: V18MigrationProgress,
  ctx: BijouContext
): Readonly<{ bar: string; count: string }> {
  if (progress.completed === undefined || progress.total === undefined) {
    return { bar: '', count: '' };
  }
  const percent = v18MigrationProgressPercent(progress.completed, progress.total);
  return {
    bar: `\n  ${progressBar(percent, { ctx, width: 28 })}`,
    count: ` ${String(progress.completed)}/${String(progress.total)}`,
  };
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
