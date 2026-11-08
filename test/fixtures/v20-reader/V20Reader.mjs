// Runs the released v20.0.0 package as an old reader for the #1079 trailer witness.
// It imports only what v20 shipped: its public entry points, and its own commit
// message codec by file, since v20 did not export one.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import { URL } from 'node:url';
import { Runtime } from '@git-stunts/git-warp';
import { createObserver, intent, reading } from '@git-stunts/git-warp/advanced';
import { TrailerCommitMessageCodecAdapter } from './node_modules/@git-stunts/git-warp/dist/src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.js';

const LANE = 'todos';

async function withLane(at, writer, work) {
  const runtime = await Runtime.open({ at, writer });
  try {
    return await work(await runtime.lane(LANE));
  } finally {
    await runtime.close();
  }
}

async function write(at, writer, subject, title) {
  return await withLane(at, writer, async (lane) => {
    const receipt = await lane.write([
      intent.node.add({ subject }),
      intent.property.set({ subject, key: 'title', value: title }),
    ]);
    return { outcome: receipt.outcome.kind };
  });
}

async function read(at, subject) {
  return await withLane(at, 'reader', async (lane) => {
    const observation = lane.observe(createObserver('v20-title', reading.property({ subject, key: 'title' }), (value) => value));
    const values = [];
    for await (const entry of observation) {
      values.push(entry.value);
    }
    const receipt = await observation.receipt;
    return { status: receipt.status, reason: receipt.reason ?? null, values };
  });
}

/** v20 cannot read a lane it has never materialized; its own repair command does that, reading every patch. */
function repair(at) {
  const cli = new URL('./node_modules/@git-stunts/git-warp/dist/bin/git-warp.js', import.meta.url);
  const args = ['--repo', at, '--json', 'repair', '--lane', LANE, '--writer', 'reader', '--action', 'materialization'];
  execFileSync(process.execPath, [cli.pathname, ...args], { encoding: 'utf8' });
  return { repaired: true };
}

function decode(path) {
  const message = new TrailerCommitMessageCodecAdapter().decodePatch(readFileSync(path, 'utf8'));
  return { ...message, patchHandle: message.patchHandle.toString() };
}

const [operation, ...args] = process.argv.slice(2);
const operations = {
  version: async () => JSON.parse(readFileSync(new URL('./node_modules/@git-stunts/git-warp/package.json', import.meta.url), 'utf8')).version,
  write: async () => await write(args[0], args[1], args[2], args[3]),
  read: async () => await read(args[0], args[1]),
  repair: async () => repair(args[0]),
  decode: async () => decode(args[0]),
};
const run = operations[operation];
if (run === undefined) {
  process.stderr.write(`unknown operation: ${String(operation)}\n`);
  process.exitCode = 2;
} else {
  const result = await run();
  process.stdout.write(`${typeof result === 'string' ? result : JSON.stringify(result)}\n`);
}
