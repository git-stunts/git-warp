import assert from 'node:assert/strict';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '@git-stunts/git-warp';
import { intent } from '@git-stunts/git-warp/advanced';

const directory = await mkdtemp(join(tmpdir(), 'warp-packed-atomic-'));
let runtime;
try {
  execFileSync('git', ['init', '--quiet', directory]);
  runtime = await Runtime.open({ at: directory, writer: 'consumer' });
  const lane = await runtime.lane('events');
  const receipt = await lane.write([
    intent.node.add({ subject: 'existing' }),
    intent.property.set({ subject: 'existing', key: 'body', value: { text: ['é😀\u0000', true] } }),
  ]);
  assert.equal(receipt.outcome.kind, 'derived');
  assert.equal(receipt.intents.length, 2);
  const writerRef = 'refs/warp/events/writers/consumer';
  const ref = () => execFileSync('git', ['-C', directory, 'rev-parse', writerRef], { encoding: 'utf8' }).trim();
  const before = ref();
  await assert.rejects(lane.write([
    intent.node.add({ subject: 'never-published' }),
    intent.property.set({ subject: 'existing', key: 'body', value: '\u0000'.repeat(4 * 1024 * 1024) }),
  ]), { code: 'E_INTENT_SEQUENCE_SIZE' });
  assert.equal(ref(), before);
  assert.equal(execFileSync('git', ['-C', directory, 'rev-list', '--count', writerRef], { encoding: 'utf8' }).trim(), '1');
  console.log('Packed atomic descriptor admission: bounded refusal preserves one-patch publication');
} finally {
  if (runtime !== undefined) { await runtime.close(); }
  await rm(directory, { recursive: true, force: true });
}
