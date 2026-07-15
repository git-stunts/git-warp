#!/usr/bin/env node

/**
 * v17.0.0 substrate migration entrypoint.
 *
 * Retired readers and translation logic belong under scripts/migrations,
 * not in shipped runtime code under src/.
 *
 * Usage:
 *   npm run upgrade -- --graph <name> [--repo <path>] [--dry-run] [--json]
 */

import process from 'node:process';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { createPersistence, resolveGraphName } from '../../../bin/cli/shared.ts';
import {
  upgradeCheckpointSchema,
  type CheckpointSchemaUpgradeResult,
} from './checkpoint-schema-upgrade.ts';
import { openCheckpointMigrationStore } from './openCheckpointMigrationStore.ts';

class MigrationCliArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationCliArgumentError';
  }
}

class MigrationCliArgs {
  constructor(
    readonly repo: string,
    readonly graph: string | null,
    readonly dryRun: boolean,
    readonly json: boolean,
    readonly help: boolean,
  ) {
    Object.freeze(this);
  }
}

function usage(): string {
  return [
    'Usage:',
    '  npm run upgrade -- --graph <name> [--repo <path>] [--dry-run] [--json]',
    '',
    'Options:',
    '  --graph <name>  Graph name to upgrade. Required unless exactly one graph exists.',
    '  --repo <path>   Git repository path. Defaults to the current working directory.',
    '  --dry-run       Read and validate retired checkpoints without moving refs.',
    '  --json          Emit machine-readable JSON.',
    '  --help          Show this help.',
  ].join('\n');
}

function parseArgs(argv: readonly string[]): MigrationCliArgs {
  let repo = process.cwd();
  let graph: string | null = null;
  let dryRun = false;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repo') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new MigrationCliArgumentError('--repo requires a path');
      }
      repo = value;
      i++;
      continue;
    }
    if (arg === '--graph') {
      const value = argv[i + 1];
      if (value === undefined) {
        throw new MigrationCliArgumentError('--graph requires a graph name');
      }
      graph = value;
      i++;
      continue;
    }
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      help = true;
      continue;
    }
    throw new MigrationCliArgumentError(`Unknown argument: ${arg ?? ''}`);
  }

  return new MigrationCliArgs(repo, graph, dryRun, json, help);
}

function formatHumanResult(result: CheckpointSchemaUpgradeResult): string {
  if (result.status === 'missing-checkpoint') {
    return `No checkpoint found for graph ${result.graphName}; nothing to upgrade.`;
  }
  if (result.status === 'already-current') {
    return `Checkpoint ${result.previousCheckpointSha ?? '(none)'} is already `
      + `schema:${result.currentSchema} storage:${result.currentStorageVersion}.`;
  }
  if (result.status === 'would-upgrade') {
    return [
      `Dry run: checkpoint ${result.previousCheckpointSha ?? '(none)'} can be upgraded.`,
      `Would write schema:${result.currentSchema} storage:${result.currentStorageVersion} `
        + `and leave ${result.checkpointRef} unchanged.`,
    ].join('\n');
  }
  return [
    `Upgraded graph ${result.graphName} checkpoint.`,
    `Previous: ${result.previousCheckpointSha ?? '(none)'} schema:${String(result.previousSchema)} `
      + `storage:${result.previousStorageVersion ?? '(unspecified)'}`,
    `Current:  ${result.upgradedCheckpointSha ?? '(none)'} schema:${result.currentSchema} `
      + `storage:${result.currentStorageVersion}`,
    `Updated:  ${result.checkpointRef}`,
  ].join('\n');
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const { persistence, runtimeStorage } = await createPersistence(args.repo);
  const graphName = await resolveGraphName(persistence, args.graph);
  const migrationStorage = await openCheckpointMigrationStore(runtimeStorage, graphName);
  const result = await upgradeCheckpointSchema({
    persistence,
    graphName,
    dryRun: args.dryRun,
    crypto: new NodeCryptoAdapter(),
    ...migrationStorage,
  });

  if (args.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${formatHumanResult(result)}\n`);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

run().catch((err: unknown) => {
  const message = errorMessage(err);
  process.stderr.write(`${message}\n\n${usage()}\n`);
  process.exitCode = 1;
});
