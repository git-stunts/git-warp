import './RequireDockerTests.ts';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { log } from 'node:console';

const { Runtime } = await import('@git-stunts/git-warp');
const { createObserver, intent, reading } = await import('@git-stunts/git-warp/advanced');
const repository = await mkdtemp(join(tmpdir(), 'warp-deno-smoke-'));
try {
  execFileSync('git', ['init', '--quiet', repository]);
  execFileSync('git', ['-C', repository, 'config', 'user.name', 'Deno smoke']);
  execFileSync('git', ['-C', repository, 'config', 'user.email', 'deno@example.invalid']);
  const runtime = await Runtime.open({ at: repository, writer: 'deno-smoke' });
  try {
    const lane = await runtime.lane('smoke');
    const receipt = await lane.write(intent.node.add({ subject: 'smoke:node' }));
    assert.equal(receipt.outcome.kind, 'derived', 'node write must be admitted');
  } finally {
    await runtime.close();
  }
  // Bounded observations require materialization evidence, prepared by the public CLI.
  execFileSync(join(process.cwd(), 'node_modules/.bin/git-warp'), [
    '--repo', repository, '--lane', 'smoke', '--writer', 'deno-smoke', '--json',
    'repair', '--action', 'materialization',
  ]);
  const reader = await Runtime.open({ at: repository, writer: 'deno-smoke-reader' });
  try {
    const lane = await reader.lane('smoke');
    const observer = createObserver('smoke.exists', reading.node.exists({ subject: 'smoke:node' }), value => {
      assert.equal(typeof value, 'boolean', 'existence reading must be boolean');
      return value;
    });
    const observation = lane.observe(observer);
    const values = [];
    for await (const item of observation) values.push(item.value);
    const observed = await observation.receipt;
    assert.equal(observed.status, 'completed', observed.reason);
    assert.deepEqual(values, [true], 'written node must be observable');
  } finally {
    await reader.close();
  }
} finally {
  await rm(repository, { recursive: true, force: true });
}
log('Deno packed consumer smoke passed: import, write, observe, close');
