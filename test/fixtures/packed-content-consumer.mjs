// Runs only against the installed tarball outside the checkout.
import assert from 'node:assert/strict';
import console from 'node:console';
import { TextDecoder } from 'node:util';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Runtime } from '@git-stunts/git-warp';
import { intent, createNodeContentObserver, createEdgeContentObserver } from '@git-stunts/git-warp/advanced';

assert.ok(existsSync('/.dockerenv'), 'Packed attachment acceptance requires Docker');
const repository = mkdtempSync(join(tmpdir(), 'packed-content-consumer-'));
function git(...args) { return execFileSync('git', ['-C', repository, ...args], { encoding: 'utf8' }); }
git('init', '-q');
git('config', 'user.name', 'Installed attachment acceptance');
git('config', 'user.email', 'attachment@example.invalid');
const edge = { from: 'document', to: 'related', label: 'links' };
const nodeObserver = createNodeContentObserver({ subject: edge.from });
const edgeObserver = createEdgeContentObserver(edge);

async function read(attachment) {
  assert.ok(attachment);
  const decoder = new TextDecoder();
  let text = '';
  for await (const bytes of attachment.open()) { text += decoder.decode(bytes, { stream: true }); }
  return text + decoder.decode();
}
function attachments(content) {
  return [intent.node.attachContent({ subject: edge.from, content }), intent.edge.attachContent({ ...edge, content })];
}
function publication(receipt, content) {
  assert.equal(receipt.outcome.kind, 'derived');
  assert.ok(receipt.evidence.basis.id.length > 0);
  const committed = receipt.intents.filter(value => value.kind.endsWith('.content.attach'));
  assert.equal(committed.length, 2);
  for (const value of committed) { assert.equal(value.descriptor.content.id, content.id); }
}
async function pair(lane) {
  const node = (await lane.observe(nodeObserver).one()).value;
  const attachedEdge = (await lane.observe(edgeObserver).one()).value;
  assert.ok(node); assert.ok(attachedEdge);
  assert.equal(node.id, attachedEdge.id);
  assert.deepEqual(attachedEdge.owner, { kind: 'edge', ...edge });
  return node;
}

let alice = await Runtime.open({ at: repository, writer: 'alice' });
let bob = await Runtime.open({ at: repository, writer: 'bob' });
try {
  let lane = await alice.lane('consumer');
  const original = await lane.stageContent('checkpoint original', { mime: 'text/plain', size: 19 });
  publication(await lane.write([
    intent.node.add({ subject: edge.from }), intent.node.add({ subject: edge.to }), intent.edge.add(edge),
    ...attachments(original),
  ]), original);
  const captured = await pair(lane);
  await alice.fork(lane, { name: 'snapshot' });
  const other = await bob.lane('consumer');
  const [first, second] = await Promise.all([
    lane.stageContent('alice update', { mime: 'text/plain', size: 12 }),
    other.stageContent('bob update longer', { mime: 'text/markdown', size: 17 }),
  ]);
  const [firstReceipt, secondReceipt] = await Promise.all([
    lane.write(attachments(first)), other.write(attachments(second)),
  ]);
  publication(firstReceipt, first); publication(secondReceipt, second);
  const winner = await pair(lane);
  const remoteWinner = await pair(other);
  assert.equal(winner.id, remoteWinner.id);
  const expected = winner.id === first.id ? first : second;
  assert.equal(winner.id, expected.id);
  assert.equal(winner.mime, expected.mime);
  assert.equal(winner.size, expected.size);
  assert.equal(await read(winner), expected === first ? 'alice update' : 'bob update longer');
  assert.equal(await read(captured), 'checkpoint original');

  // Opaque handles and copied metadata cannot forge Runtime staging provenance.
  assert.throws(() => intent.node.attachContent({ subject: edge.from, content: { ...first, id: 'malformed' } }),
    { code: 'E_CONTENT_METADATA' });
  await assert.rejects(
    lane.write([intent.node.clearContent({ subject: edge.from }), ...attachments(second)]),
    { code: 'E_CONTENT_FOREIGN' },
  );
  assert.equal((await pair(lane)).id, winner.id);
  for (const request of [
    intent.node.attachContent({ subject: 'absent', content: first }),
    intent.edge.attachContent({ ...edge, label: 'absent', content: first }),
  ]) {
    const refused = await lane.write([intent.node.clearContent({ subject: edge.from }), request]);
    assert.equal(refused.outcome.kind, 'obstruction');
    assert.equal(refused.reason, 'git-warp.write.entity-not-found');
    assert.equal((await pair(lane)).id, winner.id);
  }
  assert.equal((await lane.observe(createNodeContentObserver({ subject: 'absent' })).one()).value, null);
  assert.equal((await lane.observe(createEdgeContentObserver({ ...edge, label: 'absent' })).one()).value, null);

  async function* tooShort() { yield new Uint8Array([1]); }
  async function* tooLong() { yield new Uint8Array([1, 2, 3]); }
  await assert.rejects(lane.stageContent(tooShort(), { size: 2 }), { code: 'E_ASSET_SIZE_MISMATCH' });
  await assert.rejects(lane.stageContent(tooLong(), { size: 2 }), { code: 'E_ASSET_SIZE_MISMATCH' });
  const cancelled = new Error('producer cancelled');
  cancelled.name = 'AbortError';
  const cancellation = new globalThis.AbortController();
  let finalized = false;
  async function* producer() {
    try {
      yield new Uint8Array([1]);
      cancellation.abort(cancelled);
      cancellation.signal.throwIfAborted();
    }
    finally { finalized = true; }
  }
  const refsBefore = git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/warp/');
  await assert.rejects(lane.stageContent(producer()), error => error === cancelled);
  assert.ok(finalized);
  assert.ok(cancellation.signal.aborted);
  assert.ok(refsBefore.length > 0);
  assert.equal(git('for-each-ref', '--format=%(refname) %(objectname)', 'refs/warp/'), refsBefore);
  assert.equal((await pair(lane)).id, winner.id);

  await alice.close(); await bob.close();
  git('gc', '--prune=now');
  alice = await Runtime.open({ at: repository, writer: 'alice' });
  lane = await alice.lane('consumer');
  assert.equal((await pair(lane)).id, winner.id);
  const snapshot = await alice.strand(lane, { name: 'snapshot' });
  assert.equal(await read(await pair(snapshot)), 'checkpoint original');

  // Simulate an unavailable immutable asset without interpreting its opaque handle:
  // locate its Git blob by the known bytes, then remove that loose object.
  const missingText = 'deliberately unavailable asset';
  const missing = await lane.stageContent(missingText);
  publication(await lane.write(attachments(missing)), missing);
  const missingReading = await pair(lane);
  const objects = git('cat-file', '--batch-all-objects', '--batch-check=%(objectname) %(objecttype)').trim().split('\n');
  const blob = objects.map(line => line.split(' ')).find(([oid, type]) =>
    type === 'blob' && git('cat-file', 'blob', oid) === missingText);
  assert.ok(blob, 'staged payload Git blob exists');
  const [oid] = blob;
  const objectPath = join(repository, '.git', 'objects', oid.slice(0, 2), oid.slice(2));
  assert.ok(existsSync(objectPath), 'fixture targets a loose payload object');
  rmSync(objectPath);
  await assert.rejects(read(missingReading), { code: 'INTEGRITY_ERROR' });
  console.log('Installed attachment concurrency, checkpoint retention, receipts and negative outcomes passed.');
} finally {
  await alice.close(); await bob.close();
  rmSync(repository, { recursive: true, force: true });
}
