// Executed and typechecked from a fresh npm-tarball consumer by the packed gate.
import assert from 'node:assert/strict';
import console from 'node:console';
import { TextDecoder } from 'node:util';
import process from 'node:process';
import { Runtime } from '@git-stunts/git-warp';
import {
  intent, createNodeContentObserver, createEdgeContentObserver,
} from '@git-stunts/git-warp/advanced';

/** @param {import('@git-stunts/git-warp').ContentAttachment | null} attachment */
async function readText(attachment) {
  assert.ok(attachment);
  const decoder = new TextDecoder();
  let text = '';
  for await (const bytes of attachment.open()) {
    text += decoder.decode(bytes, { stream: true });
  }
  return text + decoder.decode();
}

/** @param {import('@git-stunts/git-warp').Lane} lane */
export async function attachmentLifecycle(lane) {
  const edge = { from: 'document', to: 'related', label: 'links' };
  const nodeObserver = createNodeContentObserver({ subject: 'document' });
  const edgeObserver = createEdgeContentObserver(edge);
  const original = await lane.stageContent('original', { mime: 'text/plain', size: 8 });
  const receipt = await lane.write([
    intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }),
    intent.edge.add(edge),
    intent.node.attachContent({ subject: 'document', content: original }),
    intent.edge.attachContent({ ...edge, content: original }),
  ]);
  assert.equal(receipt.outcome.kind, 'derived');
  const captured = (await lane.observe(nodeObserver).one()).value;
  assert.ok(captured);
  assert.equal(captured.id, original.id);
  assert.equal(captured.mime, 'text/plain');
  assert.equal(captured.size, 8);
  assert.equal(await readText((await lane.observe(edgeObserver).one()).value), 'original');

  const replacement = await lane.stageContent('replacement', { mime: 'text/plain', size: 11 });
  assert.equal((await lane.write([
    intent.node.attachContent({ subject: 'document', content: replacement }),
    intent.edge.attachContent({ ...edge, content: replacement }),
  ])).outcome.kind, 'derived');
  assert.equal(await readText((await lane.observe(nodeObserver).one()).value), 'replacement');
  assert.equal(await readText((await lane.observe(edgeObserver).one()).value), 'replacement');
  assert.equal(await readText(captured), 'original');

  // Returning early closes this stream; a new open() can still read the captured value.
  for await (const bytes of captured.open()) { assert.ok(bytes.length > 0); break; }
  assert.equal(await readText(captured), 'original');
  assert.equal((await lane.write([
    intent.node.clearContent({ subject: 'document' }), intent.edge.clearContent(edge),
  ])).outcome.kind, 'derived');
  assert.equal((await lane.observe(nodeObserver).one()).value, null);
  assert.equal((await lane.observe(edgeObserver).one()).value, null);
  assert.equal(await readText(captured), 'original');
}

const repository = process.argv[2];
assert.ok(repository, 'Usage: node attachments.mjs <disposable-git-repository>');
const runtime = await Runtime.open({ at: repository, writer: 'attachment-example' });
try {
  await attachmentLifecycle(await runtime.lane('example'));
  console.log('Installed-package attachment lifecycle example passed.');
} finally { await runtime.close(); }
