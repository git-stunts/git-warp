import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ContentAddressableStore from '@git-stunts/git-cas';
import Plumbing from '@git-stunts/plumbing';
import { intent } from '../../advanced.ts';
import { RetainedWriteReceipt, UnpublishedWriteReceipt } from '../../index.ts';
import type { WriteReceipt } from '../../index.ts';
import { Dot } from '../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../src/domain/types/ops/NodeAdd.ts';
import type { PatchOp } from '../../src/domain/types/ops/unions.ts';
import Patch from '../../src/domain/types/Patch.ts';
import { buildWriterRef, buildWritersPrefix } from '../../src/domain/utils/RefLayout.ts';
import { CborPatchJournalAdapter } from '../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAssetStorageAdapter from '../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import codec from '../../src/infrastructure/codecs/CborCodec.ts';
import * as fixture from './WarpWriteFixture.ts';

/**
 * Real writer chains in bulk for the writer-frontier tests (#1197): one Warp write per
 * writer would cost a full custody retention each, so chains are appended straight
 * through the patch journal, as another clone's writes arrive. Repositories made here
 * are removed by {@link disposeWriterChainSeeds}.
 */
const scratch: string[] = [];

/** The writer that the seed's own Warp writes as: the existing writer of every route. */
export const EXISTING_WRITER = 'alice';

/** `count` pool writer IDs, in the order the seed appends them. */
export function poolOf(count: number): readonly string[] {
  return Array.from({ length: count }, (_unused, index) => `pool-${String(index + 1).padStart(4, '0')}`);
}

/** The node each appended root patch adds. */
export function nodeOf(writer: string): string {
  return `node-of-${writer}`;
}

/** Appends one root patch for each writer to its chain; `extra` adds ops after its node. */
export async function appendChains(path: string, writers: readonly string[], extra: (writer: string) => readonly PatchOp[] = () => []): Promise<void> {
  const plumbing = await Plumbing.createDefault({ cwd: path });
  const history = new GitTimelineHistoryAdapter({ plumbing });
  try {
    const cas = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
    const journal = new CborPatchJournalAdapter({ assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: history, graph: fixture.GRAPH });
    for (const writer of writers) {
      const patch = new Patch({ writer, lamport: 1, context: {}, ops: [new NodeAdd(nodeOf(writer), new Dot(writer, 1)), ...extra(writer)] });
      await journal.appendPatch({ patch, graph: fixture.GRAPH, writer, targetRef: buildWriterRef(fixture.GRAPH, writer), expectedHead: null, parent: null, attachments: [] });
    }
  } finally {
    await history.close();
  }
}

/**
 * A repository whose only writer chains are the existing writer's and `pool`'s, every one
 * folded: the existing writer writes before and after the pool arrives.
 */
export async function seedRepository(pool: readonly string[]): Promise<string> {
  const path = await scratchDirectory('writer-chain-seed-');
  fixture.git(path, ['init', '--quiet']);
  fixture.git(path, ['config', 'user.name', 'Warp test']);
  fixture.git(path, ['config', 'user.email', 'warp@example.invalid']);
  const first = await fixture.openSwept(path);
  fixture.retained(await first.as(EXISTING_WRITER).execute(intent.node.add({ subject: 'seed' })));
  await first.close();
  await appendChains(path, pool);
  const folding = await fixture.open(path);
  fixture.retained(await folding.as(EXISTING_WRITER).execute(intent.node.add({ subject: 'pool-folded' })));
  await folding.close();
  return path;
}

export async function scratchDirectory(prefix: string): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), prefix));
  scratch.push(path);
  return path;
}

export async function copyOf(source: string): Promise<string> {
  const target = await scratchDirectory('writer-chain-copy-');
  await cp(source, target, { recursive: true });
  return target;
}

/** A bare hub holding every writer chain and the substrate marker of `source`. */
export async function hubOf(source: string): Promise<string> {
  const hub = await scratchDirectory('writer-chain-hub-');
  fixture.git(hub, ['init', '--bare', '--quiet']);
  const lane = `refs/warp/${fixture.GRAPH}`;
  fixture.git(source, ['push', '--quiet', hub, `${lane}/writers/*:${lane}/writers/*`, `${lane}/substrate-version:${lane}/substrate-version`]);
  return hub;
}

export function writerChains(path: string): number {
  return fixture.git(path, ['for-each-ref', '--format=%(refname)', buildWritersPrefix(fixture.GRAPH)]).split('\n').filter((ref) => ref !== '').length;
}

/** Every writer ref and its tip, as `ref tip` lines. */
export function writerTips(path: string): readonly string[] {
  return fixture.git(path, ['for-each-ref', '--format=%(refname) %(objectname)', buildWritersPrefix(fixture.GRAPH)]).split('\n').filter((line) => line !== '');
}

/** A receipt as one line: retained, or why it did not publish, or its kind. */
export function outcome(receipt: WriteReceipt): string {
  if (receipt instanceof RetainedWriteReceipt) {
    return 'retained';
  }
  return receipt instanceof UnpublishedWriteReceipt ? `unpublished: ${receipt.cause}` : receipt.constructor.name;
}

/** A Warp opened on `path` writes once as `writer`, and closes. */
export async function writeOnce(path: string, writer: string, subject: string): Promise<string> {
  const warp = await fixture.open(path);
  const written = outcome(await warp.as(writer).execute(intent.node.add({ subject })));
  await warp.close();
  return written;
}

/** The first `bash` block under `heading` in `docs/topics/sync.md`, as the page prints it. */
export async function syncRecipe(heading: string): Promise<string> {
  const page = await readFile(new URL('../../docs/topics/sync.md', import.meta.url), 'utf8');
  const section = page.slice(page.indexOf(`## ${heading}`));
  const start = section.indexOf('```bash\n') + '```bash\n'.length;
  return section.slice(start, section.indexOf('```', start));
}

export async function disposeWriterChainSeeds(): Promise<void> {
  await Promise.all(scratch.splice(0).map(async (path) => await rm(path, { recursive: true, force: true })));
}
