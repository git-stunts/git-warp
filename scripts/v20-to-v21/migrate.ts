#!/usr/bin/env node

import { realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

import V21MigrationSession from './V21MigrationSession.ts';

export type V21MigrationCliOptions = Readonly<{
  repositoryPath: string;
  graphs: readonly string[];
  assignOwners: ReadonlyMap<string, string>;
  check: boolean;
}>;

const USAGE = `Usage: git-warp-v20-to-v21 --repo <path> [--graph <name>]... [--assign-owner <strand>=<writer>]... [--check]

Migrates v19/v20 WARP graphs to the v21 worldline identity format (#1015).
Stop every git-warp v20 process on the repository first.

  --graph          migrate only this graph (repeatable); default: every graph
  --assign-owner   owner for a legacy strand that records none
  --check          report legacy writes that arrived after migration; change nothing

Prints one JSON report per graph. Exits 1 when a graph is refused.
`;

export function parseV21MigrationCliOptions(args: readonly string[]): V21MigrationCliOptions {
  let repositoryPath: string | null = null;
  const graphs: string[] = [];
  const assignOwners = new Map<string, string>();
  let check = false;
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    const value = args[index + 1];
    if (flag === '--check') { check = true; continue; }
    if (value === undefined) { throw new Error(`${String(flag)} needs a value\n${USAGE}`); }
    index += 1;
    if (flag === '--repo') { repositoryPath = value; continue; }
    if (flag === '--graph') { graphs.push(value); continue; }
    if (flag === '--assign-owner') {
      const [strand, writer] = value.split('=');
      if (strand === undefined || writer === undefined || strand.length === 0 || writer.length === 0) {
        throw new Error(`--assign-owner expects <strand>=<writer>, got '${value}'`);
      }
      assignOwners.set(strand, writer);
      continue;
    }
    throw new Error(`unknown option ${String(flag)}\n${USAGE}`);
  }
  if (repositoryPath === null) { throw new Error(`--repo is required\n${USAGE}`); }
  return Object.freeze({ repositoryPath: resolve(repositoryPath), graphs, assignOwners, check });
}

/** Runs the command and returns its exit code. */
export async function runV21MigrationCli(options: V21MigrationCliOptions, write: (line: string) => void): Promise<number> {
  const session = await V21MigrationSession.open(options.repositoryPath);
  let exitCode = 0;
  try {
    const graphs = options.graphs.length > 0 ? options.graphs : await session.graphs();
    for (const graph of graphs) {
      if (options.check) {
        write(JSON.stringify({ graph, lateWrites: await session.lateWrites(graph) }));
        continue;
      }
      const outcome = await session.migrate(graph, options.assignOwners);
      if (outcome.status === 'refused') { exitCode = 1; }
      write(JSON.stringify({ graph, ...outcome }));
    }
  } finally {
    await session.close();
  }
  return exitCode;
}

async function main(): Promise<void> {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    process.stdout.write(USAGE);
    return;
  }
  const options = parseV21MigrationCliOptions(process.argv.slice(2));
  process.exitCode = await runV21MigrationCli(options, (line) => { process.stdout.write(`${line}\n`); });
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(realpathSync(entry)).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
