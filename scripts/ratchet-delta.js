#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

import {
  diffSnapshots,
  formatDelta,
  listSnapshotPaths,
  readSnapshot,
} from './ratchet-telemetry.js';

const execFile = promisify(execFileCallback);

/**
 * @param {string[]} args
 * @returns {{ branch?: string, from?: string, to?: string, outputRoot: string, format: string }}
 */
function parseArgs(args) {
  /** @type {{ branch?: string, from?: string, to?: string, outputRoot: string, format: string }} */
  const options = { outputRoot: 'docs/method/ratchet', format: 'text' };
  for (const arg of args) {
    if (arg.startsWith('--branch=')) {
      options.branch = arg.slice('--branch='.length);
      continue;
    }
    if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length);
      continue;
    }
    if (arg.startsWith('--to=')) {
      options.to = arg.slice('--to='.length);
      continue;
    }
    if (arg.startsWith('--output-root=')) {
      options.outputRoot = arg.slice('--output-root='.length);
      continue;
    }
    if (arg.startsWith('--format=')) {
      options.format = arg.slice('--format='.length);
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

async function currentBranch() {
  const { stdout } = await execFile('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' });
  return stdout.trim();
}

/**
 * @param {string[]} args
 * @returns {Promise<void>}
 */
async function main(args) {
  const options = parseArgs(args);
  const branch = options.branch ?? await currentBranch();
  const paths = await listSnapshotPaths({ outputRoot: options.outputRoot, branch });
  if (paths.length === 0) {
    throw new Error(`No snapshots found for ${branch} under ${options.outputRoot}`);
  }
  const fromPath = options.from ?? paths[0];
  const toPath = options.to ?? paths.at(-1);
  if (fromPath === undefined) {
    throw new Error('Unable to resolve source snapshot');
  }
  if (toPath === undefined) {
    throw new Error('Unable to resolve target snapshot');
  }
  const delta = diffSnapshots(await readSnapshot(fromPath), await readSnapshot(toPath));
  console.log(options.format === 'json' ? JSON.stringify(delta, null, 2) : formatDelta(delta));
}

main(process.argv.slice(2)).catch(error => {
  console.error(`ratchet-delta: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
