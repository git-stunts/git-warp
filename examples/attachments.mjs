// Executed and typechecked from a fresh npm-tarball consumer by the packed gate.
import assert from 'node:assert/strict';
import console from 'node:console';
import { TextDecoder } from 'node:util';
import process from 'node:process';
import {
  GitStorage, RetainedWriteReceipt, Runtime, Warp, WarpAccessDenied, WarpAccessPort, WarpAddress, WarpWriteGrant,
} from '@git-stunts/git-warp';
import {
  intent, createNodeContentObserver, createEdgeContentObserver,
} from '@git-stunts/git-warp/advanced';

const GRAPH = 'example';

/** A single-principal example: it grants every writer a small budget. */
class ExampleAccess extends WarpAccessPort {
  /** @param {import('@git-stunts/git-warp').WarpWriteRequest} request */
  authorizeWrite(request) {
    return Promise.resolve(new WarpWriteGrant({
      authority: `example:${request.writer}`,
      budget: { records: 256, bytes: 1024 * 1024, work: 10_000 },
    }));
  }
}

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

/**
 * @param {import('@git-stunts/git-warp').AuthoredWarp} author
 * @param {string} text
 */
async function stage(author, text) {
  const staged = await author.stage(text, { mime: 'text/plain' });
  assert.ok(!(staged instanceof WarpAccessDenied));
  return staged;
}

/**
 * @param {import('@git-stunts/git-warp').AuthoredWarp} author
 * @param {import('@git-stunts/git-warp').WriteIntentInput} input
 */
async function write(author, input) {
  assert.ok((await author.execute(input)) instanceof RetainedWriteReceipt);
}

/**
 * @param {import('@git-stunts/git-warp').AuthoredWarp} author
 * @param {import('@git-stunts/git-warp').Lane} lane
 */
export async function attachmentLifecycle(author, lane) {
  const edge = { from: 'document', to: 'related', label: 'links' };
  const nodeObserver = createNodeContentObserver({ subject: 'document' });
  const edgeObserver = createEdgeContentObserver(edge);
  const original = await stage(author, 'original');
  await write(author, [
    intent.node.add({ subject: 'document' }), intent.node.add({ subject: 'related' }),
    intent.edge.add(edge),
    intent.node.attachContent({ subject: 'document', content: original }),
    intent.edge.attachContent({ ...edge, content: original }),
  ]);
  const captured = (await lane.observe(nodeObserver).one()).value;
  assert.ok(captured);
  assert.equal(captured.id, original.id);
  assert.equal(captured.mime, 'text/plain');
  assert.equal(captured.size, 8);
  assert.equal(await readText((await lane.observe(edgeObserver).one()).value), 'original');

  const replacement = await stage(author, 'replacement');
  await write(author, [
    intent.node.attachContent({ subject: 'document', content: replacement }),
    intent.edge.attachContent({ ...edge, content: replacement }),
  ]);
  assert.equal(await readText((await lane.observe(nodeObserver).one()).value), 'replacement');
  assert.equal(await readText((await lane.observe(edgeObserver).one()).value), 'replacement');
  assert.equal(await readText(captured), 'original');

  // Returning early closes this stream; a new open() can still read the captured value.
  for await (const bytes of captured.open()) { assert.ok(bytes.length > 0); break; }
  assert.equal(await readText(captured), 'original');
  await write(author, [intent.node.clearContent({ subject: 'document' }), intent.edge.clearContent(edge)]);
  assert.equal((await lane.observe(nodeObserver).one()).value, null);
  assert.equal((await lane.observe(edgeObserver).one()).value, null);
  assert.equal(await readText(captured), 'original');
}

const repository = process.argv[2];
assert.ok(repository, 'Usage: node attachments.mjs <disposable-git-repository>');
const warp = await Warp.open(WarpAddress.of(GitStorage.at(repository), GRAPH), new ExampleAccess());
const runtime = await Runtime.open({ at: repository, writer: 'attachment-reader' });
try {
  await attachmentLifecycle(warp.as('attachment-example'), await runtime.lane(GRAPH));
  console.log('Installed-package attachment lifecycle example passed.');
} finally {
  await runtime.close();
  await warp.close();
}
