// Copied into the isolated consumer by smoke-packed-artifact.sh.
import assert from 'node:assert/strict';
import console from 'node:console';
import { TextEncoder, TextDecoder } from 'node:util';
import { ReadableStream } from 'node:stream/web';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '@git-stunts/git-warp';
import { intent, createNodeContentObserver, createEdgeContentObserver } from '@git-stunts/git-warp/advanced';

assert.ok(existsSync('/.dockerenv'), 'Packed attachment acceptance requires Docker');
const repository = mkdtempSync(join(tmpdir(), 'packed-content-'));
execFileSync('git', ['init', '-q', repository]);
execFileSync('git', ['-C', repository, 'config', 'user.name', 'Packed content consumer']);
execFileSync('git', ['-C', repository, 'config', 'user.email', 'consumer@example.invalid']);
const edge = { from: 'document', to: 'related', label: 'links' };
const nodeObserver = createNodeContentObserver({ subject: 'document' });
const edgeObserver = createEdgeContentObserver(edge);
const encoder = new TextEncoder();

async function text(value) {
  assert.ok(value, 'attachment exists');
  const decoder = new TextDecoder();
  let result = '';
  for await (const chunk of value.open()) { result += decoder.decode(chunk, { stream: true }); }
  return result + decoder.decode();
}
function derived(receipt) { assert.equal(receipt.outcome.kind, 'derived'); }

let runtime = await Runtime.open({ at: repository, writer: 'consumer' });
try {
  let lane = await runtime.lane('documents');
  const original = await lane.stageContent('original', { mime: 'text/plain', size: 8 });
  derived(await lane.write([
    intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }), intent.edge.add(edge),
    intent.node.attachContent({ subject: 'document', content: original }),
    intent.edge.attachContent({ ...edge, content: original }),
  ]));
  const observation = lane.observe(nodeObserver);
  const historical = await observation.one();
  assert.equal((await observation.receipt).status, 'completed');
  assert.deepEqual(historical.value.owner, { kind: 'node', subject: 'document' });
  assert.equal(historical.value.mime, 'text/plain');
  assert.equal(historical.value.size, 8);
  assert.equal(await text((await lane.observe(edgeObserver).one()).value), 'original');

  let finalized = false;
  const failure = new Error('producer failed');
  async function* failedProducer() {
    try { yield encoder.encode('partial'); throw failure; }
    finally { finalized = true; }
  }
  await assert.rejects(lane.stageContent(failedProducer()), error => error === failure);
  assert.ok(finalized);
  await assert.rejects(lane.stageContent('too long', { size: 1 }));
  assert.equal((await lane.observe(nodeObserver).one()).value.id, original.id);

  const replacement = await lane.stageContent(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode('replacement')); controller.close(); },
  }));
  derived(await lane.write([
    intent.node.attachContent({ subject: 'document', content: replacement }),
    intent.edge.attachContent({ ...edge, content: replacement }),
  ]));
  const absentOwner = await lane.write([
    intent.node.clearContent({ subject: 'document' }),
    intent.edge.attachContent({ ...edge, label: 'absent', content: replacement }),
  ]);
  assert.equal(absentOwner.outcome.kind, 'obstruction');
  assert.equal(await text((await lane.observe(nodeObserver).one()).value), 'replacement');
  assert.equal(await text(historical.value), 'original');

  // Fork captures a checkpoint through the supported Runtime API.
  await runtime.fork(lane, { name: 'retention-checkpoint' });
  await runtime.close();
  execFileSync('git', ['-C', repository, 'gc', '--prune=now']);
  runtime = await Runtime.open({ at: repository, writer: 'consumer' });
  lane = await runtime.lane('documents');
  assert.equal(await text((await lane.observe(nodeObserver).one()).value), 'replacement');
  assert.equal(await text((await lane.observe(edgeObserver).one()).value), 'replacement');

  // A generated stream is consumed chunk-by-chunk; no complete payload is retained.
  const chunkSize = 64 * 1024;
  const chunkCount = 1024;
  async function* generated() {
    for (let index = 0; index < chunkCount; index++) { yield new Uint8Array(chunkSize).fill(index % 251); }
  }
  const large = await lane.stageContent(generated(), { size: chunkSize * chunkCount });
  derived(await lane.write(intent.edge.attachContent({ ...edge, content: large })));
  const largeReading = await lane.observe(edgeObserver).one();
  let consumed = 0;
  for await (const chunk of largeReading.value.open()) {
    for (let index = 0; index < chunk.length; index++) {
      assert.equal(chunk[index], Math.floor((consumed + index) / chunkSize) % 251);
    }
    consumed += chunk.length;
  }
  assert.equal(consumed, large.size);
  for await (const chunk of largeReading.value.open()) { assert.ok(chunk.length > 0); break; }

  const beforeClear = await lane.observe(nodeObserver).one();
  derived(await lane.write([intent.node.clearContent({ subject: 'document' }), intent.edge.clearContent(edge)]));
  assert.equal((await lane.observe(nodeObserver).one()).value, null);
  assert.equal((await lane.observe(edgeObserver).one()).value, null);
  assert.equal(await text(beforeClear.value), 'replacement');
  const unused = beforeClear.value.open();
  await runtime.close();
  await assert.rejects(unused[Symbol.asyncIterator]().next(), { code: 'E_RUNTIME_CLOSED' });
  console.log(`Packed public node/edge attachment acceptance passed; streamed ${consumed} bytes.`);
} finally { await runtime.close(); }
