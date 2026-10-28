import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Runtime, type Intent, type Lane, type ReadingValue } from '../../../index.ts';
import {
  captureCoordinate,
  createEdgeContentObserver,
  createNodeContentObserver,
  createObserver,
  intent,
  reading,
} from '../../../advanced.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import BoundedNodeRemovalBasis from '../../../src/domain/services/BoundedNodeRemovalBasis.ts';
import ContentReadProjection from '../../../src/domain/services/ContentReadProjection.ts';
import CheckpointController from '../../../src/domain/services/controllers/CheckpointController.ts';
import CheckpointTailBasisVerifier from '../../../src/domain/services/optic/CheckpointTailBasisVerifier.ts';
import CheckpointTailWitnessLocator from '../../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import ContentAddressableStore from '@git-stunts/git-cas';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * Architecture trap (#1039): every public Lane write and Lane observation,
 * content Observations and captured-coordinate optic reads, must stay off
 * whole-state materialization, whole-state checkpoints, history replay and
 * the checkpoint-tail locator. A trap that fires fails the test with the
 * entry point that reached it.
 */

const EDGE = Object.freeze({ from: 'doc', to: 'tag', label: 'tagged' });
const hits: string[] = [];

function trap(name: string): () => never {
  return () => {
    hits.push(name);
    throw new Error(`trap: public path reached ${name}`);
  };
}

/** One head read is bounded; a scan that walks past the first patch replays history. */
function trapHistoryWalks(): void {
  const scan = CborPatchJournalAdapter.prototype.scanPatchHistory;
  vi.spyOn(CborPatchJournalAdapter.prototype, 'scanPatchHistory').mockImplementation(function guarded(this: CborPatchJournalAdapter, writer, sha) {
    const history = scan.call(this, writer, sha);
    return WarpStream.from({
      async *[Symbol.asyncIterator]() {
        let yielded = 0;
        for await (const entry of history) {
          if (yielded === 1) {
            trap('journal.scanPatchHistory beyond the head')();
          }
          yielded += 1;
          yield entry;
        }
      },
    });
  });
}

function installTraps(): void {
  vi.spyOn(RuntimeHost.prototype, '_materializeGraph').mockImplementation(trap('RuntimeHost._materializeGraph'));
  vi.spyOn(RuntimeHost.prototype, 'materialize').mockImplementation(trap('RuntimeHost.materialize'));
  vi.spyOn(RuntimeHost.prototype, 'materializeCoordinate').mockImplementation(trap('RuntimeHost.materializeCoordinate'));
  vi.spyOn(CheckpointController.prototype, 'createCheckpoint').mockImplementation(trap('CheckpointController.createCheckpoint'));
  vi.spyOn(CheckpointTailBasisVerifier.prototype, 'verify').mockImplementation(trap('CheckpointTailBasisVerifier.verify'));
  for (const method of ['readNode', 'readNodeProperty', 'readNeighborhood', 'readTraversal'] as const) {
    vi.spyOn(CheckpointTailWitnessLocator.prototype, method).mockImplementation(trap(`CheckpointTailWitnessLocator.${method}`));
  }
  vi.spyOn(BoundedNodeRemovalBasis, 'capture').mockImplementation(trap('BoundedNodeRemovalBasis.capture'));
  vi.spyOn(ContentReadProjection.prototype, 'read').mockImplementation(trap('ContentReadProjection.read'));
  trapHistoryWalks();
}

let repository: Awaited<ReturnType<typeof createTestRepo>>;
beforeEach(async () => {
  hits.length = 0;
  repository = await createTestRepo('cone-traps');
});
afterEach(async () => {
  vi.restoreAllMocks();
  await repository.cleanup();
});

async function written(lane: Lane, intents: Intent | Intent[]): Promise<string> {
  return (await lane.write(intents)).outcome.kind;
}

async function observed(lane: Lane, plan: ReturnType<typeof reading.property>): Promise<string> {
  const observation = lane.observe(createObserver('trap.one', plan, (value: ReadingValue) => value));
  for await (const _value of observation) { /* drain */ }
  return (await observation.receipt).status;
}

it('drives every public write intent and every public read without reaching a whole-state trap', async () => {
  const runtime = await Runtime.open({ at: repository.tempDir, writer: 'alice' });
  try {
    const lane = await runtime.lane('events');
    for (let index = 0; index < 20; index += 1) {
      await lane.write(intent.node.add({ subject: `history${index}` }));
    }
    installTraps();
    const content = await lane.stageContent('bytes', { mime: 'text/plain' });
    const outcomes = [
      await written(lane, [intent.node.add({ subject: 'doc' }), intent.node.add({ subject: 'tag' }), intent.edge.add(EDGE)]),
      await written(lane, intent.property.set({ subject: 'doc', key: 'title', value: 'T' })),
      await written(lane, intent.entity.add({ subject: 'entity', properties: { kind: 'card' } })),
      await written(lane, intent.entity.addAuto({ namespace: 'cards', properties: { kind: 'card' } })),
      await written(lane, intent.node.attachContent({ subject: 'doc', content })),
      await written(lane, intent.edge.attachContent({ ...EDGE, content })),
      await written(lane, intent.edge.clearContent(EDGE)),
      await written(lane, intent.node.clearContent({ subject: 'doc' })),
      await written(lane, intent.edge.remove(EDGE)),
      await written(lane, intent.node.remove({ subject: 'history3' })),
    ];
    expect(outcomes).toEqual(Array.from({ length: outcomes.length }, () => 'derived'));
    const statuses = [
      await observed(lane, reading.property({ subject: 'doc', key: 'title' })),
      await observed(lane, reading.node.exists({ subject: 'history3' })),
      await observed(lane, reading.neighborhood({ subject: 'doc', direction: 'both' })),
    ];
    expect(statuses).toEqual(['completed', 'completed', 'completed']);
    expect((await lane.observe(createNodeContentObserver({ subject: 'doc' })).receipt).status).toBe('completed');
    expect((await lane.observe(createEdgeContentObserver(EDGE)).receipt).status).toBe('completed');
    const optic = (await captureCoordinate(lane)).optic();
    expect((await optic.node('doc').read()).alive).toBe(true);
    expect((await optic.node('doc').prop('title').read()).value).toBe('T');
    expect((await optic.neighborhood('doc').read()).edges).toEqual([]);
    expect((await optic.traversal('doc').read({ maxDepth: 1, maxNodes: 2, maxEdges: 2 })).completeness).toBe('complete');
  } finally {
    await runtime.close();
  }
  expect(hits).toEqual([]);
});

it('arms traps that a remaining whole-state public path still reaches (Runtime.fork, slice 4)', async () => {
  const runtime = await Runtime.open({ at: repository.tempDir, writer: 'alice' });
  try {
    const lane = await runtime.lane('events');
    await lane.write(intent.node.add({ subject: 'a' }));
    await lane.write(intent.node.add({ subject: 'b' }));
    installTraps();
    await expect(runtime.fork(lane, { name: 'draft' })).rejects.toThrow('trap: public path reached');
    expect(hits).toContain('CheckpointTailBasisVerifier.verify');
  } finally {
    await runtime.close();
  }
  const cas = ContentAddressableStore.createCbor({ plumbing: repository.plumbing, applicationRefPrefixes: ['refs/warp/'] });
  const journal = new CborPatchJournalAdapter({
    assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: repository.persistence, graph: 'events',
  });
  const history = journal.scanPatchHistory('alice', await repository.persistence.readRef('refs/warp/events/writers/alice') ?? '');
  await expect((async () => { for await (const _entry of history) { /* walk */ } })()).rejects.toThrow('beyond the head');
});
