import assert from 'node:assert/strict';
import console from 'node:console';
import fs from 'node:fs';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const callerRequire = createRequire(require.resolve('@vercel/nft'));
const { glob } = callerRequire('glob');
const directory = await mkdtemp(join(tmpdir(), 'glob-abort-security-'));
const controller = new globalThis.AbortController();
const reason = new Error('deliberate cancellation');
const BRANCHES = 3;
let reads = 0;
let pending = 0;
const observedFs = {
  ...fs,
  readdir(path, options, callback) {
    reads += 1;
    pending += 1;
    if (reads === 1) controller.abort(reason);
    fs.readdir(path, options, (...args) => {
      callback(...args);
      pending -= 1;
    });
  },
};

try {
  for (let branch = 0; branch < BRANCHES; branch += 1) {
    const child = join(directory, `branch-${branch}`, 'nested');
    await mkdir(child, { recursive: true });
    await writeFile(join(child, 'leaf.txt'), 'bounded fixture\n');
  }
  const found = await glob('**/*.txt', { cwd: directory, nodir: true });
  assert.equal(found.length, BRANCHES);
  await assert.rejects(
    glob('**/*', { cwd: directory, signal: controller.signal, fs: observedFs }),
    error => error === reason,
  );
  const readsAtRejection = reads;
  while (pending > 0) await setImmediate();
  await setImmediate();
  assert.equal(readsAtRejection, 1, 'cancellation occurs during the first read');
  assert.equal(reads, readsAtRejection, 'no traversal after rejected cancellation');
  console.log('glob cancellation stopped traversal');
} finally {
  await rm(directory, { recursive: true, force: true });
}
