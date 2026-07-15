#!/usr/bin/env node

/**
 * Top-level v16 -> v17 graph substrate upgrade utility.
 *
 * Usage:
 *   npm run upgrade -- [--repo <path>] [--graph <name>] [--dry-run] [--json]
 */

import process from 'node:process';
import { fileURLToPath } from 'node:url';
import NodeCryptoAdapter from '../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { createPersistence } from '../bin/cli/shared.ts';
import { REF_PREFIX } from '../src/domain/utils/RefLayout.ts';
import CliJsonFormatterAdapter from '../src/infrastructure/adapters/CliJsonFormatterAdapter.ts';
import {
  upgradeCheckpointSchema,
  type CheckpointSchemaUpgradeResult,
  type CheckpointMigrationHistory,
} from './migrations/v17.0.0/checkpoint-schema-upgrade.ts';
import type CryptoPort from '../src/ports/CryptoPort.ts';
import type RuntimeStorageProviderPort from '../src/ports/RuntimeStorageProviderPort.ts';
import { openCheckpointMigrationStore } from './migrations/v17.0.0/openCheckpointMigrationStore.ts';

const LEGACY_REBUILDABLE_CACHE_REF_SUFFIXES = [
  '/coverage/head',
  '/seek-cache',
] as const;
type CacheRefAction = 'absent' | 'would-delete' | 'deleted';

export class V16ToV17UpgradeArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V16ToV17UpgradeArgumentError';
  }
}

type V16ToV17UpgradeArgsOptions = {
  readonly repo: string;
  readonly graphNames: readonly string[];
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly help: boolean;
};

export class V16ToV17UpgradeArgs {
  readonly repo: string;
  readonly graphNames: readonly string[];
  readonly dryRun: boolean;
  readonly json: boolean;
  readonly help: boolean;

  constructor(options: V16ToV17UpgradeArgsOptions) {
    this.repo = options.repo;
    this.graphNames = options.graphNames;
    this.dryRun = options.dryRun;
    this.json = options.json;
    this.help = options.help;
    Object.freeze(this);
  }
}

export interface CacheRefMigrationResult {
  readonly ref: string;
  readonly action: CacheRefAction;
  readonly previousOid: string | null;
}
export interface GraphV16ToV17UpgradeResult {
  readonly graphName: string;
  readonly checkpoint: CheckpointSchemaUpgradeResult;
  readonly cacheRefs: readonly CacheRefMigrationResult[];
}
export interface V16ToV17UpgradeResult {
  readonly dryRun: boolean;
  readonly graphCount: number;
  readonly graphs: readonly GraphV16ToV17UpgradeResult[];
}
export interface V16ToV17UpgradeOptions {
  readonly persistence: V16ToV17MigrationHistory;
  readonly graphNames: readonly string[];
  readonly dryRun?: boolean;
  readonly crypto?: CryptoPort;
  readonly runtimeStorage: RuntimeStorageProviderPort;
}
export interface V16ToV17MigrationHistory extends CheckpointMigrationHistory {
  deleteRef(ref: string): Promise<void>;
  listRefs(prefix?: string): Promise<string[]>;
}

function usage(): string {
  return [
    'Usage:',
    '  npm run upgrade -- [--repo <path>] [--graph <name>] [--dry-run] [--json]',
    '',
    'Options:',
    '  --repo <path>   Git repository path. Defaults to the current working directory.',
    '  --graph <name>  Upgrade one graph. May be repeated. Defaults to all discovered graphs.',
    '  --dry-run       Validate and report work without updating refs.',
    '  --json          Emit machine-readable JSON.',
    '  --help          Show this help.',
  ].join('\n');
}

export function parseArgs(argv: readonly string[], cwd: string): V16ToV17UpgradeArgs {
  let repo = cwd;
  const graphNames: string[] = [];
  let dryRun = false;
  let json = false;
  let help = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--repo') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new V16ToV17UpgradeArgumentError('--repo requires a path');
      }
      repo = value;
      i++;
      continue;
    }
    if (arg === '--graph') {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new V16ToV17UpgradeArgumentError('--graph requires a graph name');
      }
      graphNames.push(value);
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
    throw new V16ToV17UpgradeArgumentError(`Unknown argument: ${arg ?? ''}`);
  }

  return new V16ToV17UpgradeArgs({ repo, graphNames, dryRun, json, help });
}

export async function upgradeV16ToV17(
  options: V16ToV17UpgradeOptions,
): Promise<V16ToV17UpgradeResult> {
  const crypto = options.crypto ?? new NodeCryptoAdapter();
  const dryRun = options.dryRun === true;
  const graphs: GraphV16ToV17UpgradeResult[] = [];

  for (const graphName of options.graphNames) {
    const migrationStorage = await openCheckpointMigrationStore(options.runtimeStorage, graphName);
    const checkpoint = await upgradeCheckpointSchema({
      persistence: options.persistence,
      graphName,
      dryRun,
      crypto,
      ...migrationStorage,
    });
    const cacheRefs = await migrateRebuildableCacheRefs({
      persistence: options.persistence,
      graphName,
      dryRun,
    });
    graphs.push(Object.freeze({ graphName, checkpoint, cacheRefs }));
  }

  return Object.freeze({
    dryRun,
    graphCount: graphs.length,
    graphs,
  });
}

async function migrateRebuildableCacheRefs(options: {
  readonly persistence: V16ToV17MigrationHistory;
  readonly graphName: string;
  readonly dryRun: boolean;
}): Promise<readonly CacheRefMigrationResult[]> {
  const results: CacheRefMigrationResult[] = [];

  for (const suffix of LEGACY_REBUILDABLE_CACHE_REF_SUFFIXES) {
    const ref = `refs/warp/${options.graphName}${suffix}`;
    const previousOid = await options.persistence.readRef(ref);
    if (previousOid === null) {
      results.push(Object.freeze({ ref, action: 'absent', previousOid }));
      continue;
    }
    if (options.dryRun) {
      results.push(Object.freeze({ ref, action: 'would-delete', previousOid }));
      continue;
    }
    await options.persistence.deleteRef(ref);
    results.push(Object.freeze({ ref, action: 'deleted', previousOid }));
  }

  return results;
}

function checkpointLine(checkpoint: CheckpointSchemaUpgradeResult): string {
  if (checkpoint.status === 'missing-checkpoint') return `checkpoint: none found at ${checkpoint.checkpointRef}`;
  if (checkpoint.status === 'already-current') return `checkpoint: already schema:${checkpoint.currentSchema} storage:${checkpoint.currentStorageVersion}`;
  const action = checkpoint.status === 'would-upgrade' ? 'would upgrade' : 'upgraded';
  return `checkpoint: ${action} schema:${String(checkpoint.previousSchema)} `
    + `storage:${checkpoint.previousStorageVersion ?? '(unspecified)'} -> `
    + `schema:${checkpoint.currentSchema} storage:${checkpoint.currentStorageVersion}`;
}

export function formatHumanResult(result: V16ToV17UpgradeResult): string {
  if (result.graphs.length === 0) {
    return 'No WARP graphs found in this repository.';
  }

  const lines: string[] = [
    result.dryRun
      ? `Dry run: inspected ${result.graphCount} graph(s).`
      : `Upgraded ${result.graphCount} graph(s).`,
  ];

  for (const graph of result.graphs) {
    lines.push('', `Graph: ${graph.graphName}`, `  ${checkpointLine(graph.checkpoint)}`);
    const changedRefs = graph.cacheRefs.filter((cacheRef) => cacheRef.action !== 'absent');
    if (changedRefs.length === 0) {
      lines.push('  rebuildable cache refs: none found');
      continue;
    }
    for (const cacheRef of changedRefs) {
      lines.push(`  rebuildable cache ref: ${cacheRef.action} ${cacheRef.ref}`);
    }
  }

  return lines.join('\n');
}

async function resolveGraphNames(
  persistence: V16ToV17MigrationHistory,
  explicitGraphNames: readonly string[],
): Promise<readonly string[]> {
  if (explicitGraphNames.length > 0) {
    return [...new Set(explicitGraphNames)].sort();
  }
  return await discoverGraphNames(persistence);
}

async function discoverGraphNames(persistence: V16ToV17MigrationHistory): Promise<readonly string[]> {
  const refs = await persistence.listRefs(REF_PREFIX);
  const prefix = `${REF_PREFIX}/`;
  const names: Set<string> = new Set();

  for (const ref of refs) {
    if (!ref.startsWith(prefix)) {
      continue;
    }
    const rest = ref.slice(prefix.length);
    const [graphName] = rest.split('/');
    if (typeof graphName === 'string' && graphName.length > 0) {
      names.add(graphName);
    }
  }

  return [...names].sort();
}

async function run(): Promise<void> {
  const args = parseArgs(process.argv.slice(2), process.cwd());
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }

  const { persistence, runtimeStorage } = await createPersistence(args.repo);
  const graphNames = await resolveGraphNames(persistence, args.graphNames);
  const result = await upgradeV16ToV17({
    persistence,
    graphNames,
    dryRun: args.dryRun,
    runtimeStorage,
  });

  if (args.json) {
    process.stdout.write(new CliJsonFormatterAdapter().format(result));
    return;
  }
  process.stdout.write(`${formatHumanResult(result)}\n`);
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    process.stderr.write(`${err.message}\n\n${usage()}\n`);
    process.exitCode = 1;
  });
}
