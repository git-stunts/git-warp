import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Runtime, type Intent, type Lane, type ReadingValue } from '../../../index.ts';
import {
  captureCoordinate,
  createEdgeContentObserver,
  createNodeContentObserver,
  createEntityAdmissionInventoryObserver,
  createObserver,
  intent,
  reading,
  requireEntityAdmissionInventoryCertificate,
} from '../../../advanced.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import CheckpointController from '../../../src/domain/services/controllers/CheckpointController.ts';
import { PatchDiscovery } from '../../../src/domain/services/controllers/PatchDiscovery.ts';
import CheckpointTailBasisLoader from '../../../src/domain/services/optic/CheckpointTailBasisLoader.ts';
import CheckpointTailWitnessLocator from '../../../src/domain/services/optic/CheckpointTailWitnessLocator.ts';
import StrandMaterializer from '../../../src/domain/services/strand/StrandMaterializer.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import ContentAddressableStore from '@git-stunts/git-cas';
import WarpStream from '../../../src/domain/stream/WarpStream.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import { createTestRepo } from '../api/helpers/setup.ts';
import handleRepair from '../../../bin/cli/commands/repair.ts';
import { closeCliStorages } from '../../../bin/cli/shared.ts';

/**
 * Architecture trap (#1039): every client-facing entry point (Lane writes
 * and Observations on worldline and strand Lanes, content Observations,
 * captured-coordinate optic reads on both, the entity admission inventory,
 * Runtime.fork, previewSettlement, settle and the `repair --action basis`
 * CLI path) stays off whole-state
 * materialization, whole-state
 * checkpoints, the checkpoint-tail basis and locator, strand
 * materialization and history replay. A trap that fires fails the test with
 * the entry point that reached it.
 */

type TestEdge = Readonly<{ from: string; to: string; label: string }>;

const EDGE: TestEdge = Object.freeze({ from: 'doc', to: 'tag', label: 'tagged' });
const STRAND_EDGE: TestEdge = Object.freeze({ from: 'card', to: 'history1', label: 'about' });
const hits: string[] = [];

function trap(name: string): () => never {
  return () => {
    hits.push(name);
    throw new Error(`trap: public path reached ${name}`);
  };
}

/** One head read is bounded; a scan past the first patch or a whole-chain load replays history. */
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
  vi.spyOn(PatchDiscovery.prototype, 'loadPatchChainFromSha').mockImplementation(trap('PatchDiscovery.loadPatchChainFromSha'));
}

function installTraps(): void {
  vi.spyOn(RuntimeHost.prototype, '_materializeGraph').mockImplementation(trap('RuntimeHost._materializeGraph'));
  vi.spyOn(RuntimeHost.prototype, 'materialize').mockImplementation(trap('RuntimeHost.materialize'));
  vi.spyOn(RuntimeHost.prototype, 'materializeCoordinate').mockImplementation(trap('RuntimeHost.materializeCoordinate'));
  vi.spyOn(RuntimeHost.prototype, 'materializeStrand').mockImplementation(trap('RuntimeHost.materializeStrand'));
  vi.spyOn(RuntimeHost.prototype, '_materializeStrandGraph').mockImplementation(trap('RuntimeHost._materializeStrandGraph'));
  vi.spyOn(CheckpointController.prototype, 'createCheckpoint').mockImplementation(trap('CheckpointController.createCheckpoint'));
  vi.spyOn(CheckpointTailBasisLoader.prototype, 'load').mockImplementation(trap('CheckpointTailBasisLoader.load'));
  for (const method of ['readNode', 'readNodeProperty', 'readNeighborhood', 'readTraversal'] as const) {
    vi.spyOn(CheckpointTailWitnessLocator.prototype, method).mockImplementation(trap(`CheckpointTailWitnessLocator.${method}`));
  }
  vi.spyOn(StrandMaterializer.prototype, 'materializeDescriptor').mockImplementation(trap('StrandMaterializer.materializeDescriptor'));
  vi.spyOn(StrandMaterializer.prototype, 'collectPatchEntries').mockImplementation(trap('StrandMaterializer.collectPatchEntries'));
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

/** Every public write intent kind, in an order that makes each one admissible. */
async function writeEveryIntentKind(lane: Lane, edge: TestEdge, removable: string): Promise<readonly string[]> {
  const content = await lane.stageContent('bytes', { mime: 'text/plain' });
  return [
    await written(lane, [intent.node.add({ subject: edge.from }), intent.node.add({ subject: edge.to }), intent.edge.add(edge)]),
    await written(lane, intent.property.set({ subject: edge.from, key: 'title', value: 'T' })),
    await written(lane, intent.entity.add({ subject: `${edge.from}:entity`, properties: { kind: 'card' } })),
    await written(lane, intent.entity.addAuto({ namespace: 'cards', properties: { kind: 'card' } })),
    await written(lane, intent.node.attachContent({ subject: edge.from, content })),
    await written(lane, intent.edge.attachContent({ ...edge, content })),
    await written(lane, intent.edge.clearContent(edge)),
    await written(lane, intent.node.clearContent({ subject: edge.from })),
    await written(lane, intent.edge.remove(edge)),
    await written(lane, intent.node.remove({ subject: removable })),
  ];
}

/** Every Reading kind, both content observers and captured-coordinate optic reads. */
async function readEveryKind(lane: Lane, edge: TestEdge, removed: string): Promise<readonly unknown[]> {
  const subject = edge.from;
  const statuses = [
    await observed(lane, reading.property({ subject, key: 'title' })),
    await observed(lane, reading.node.exists({ subject: removed })),
    await observed(lane, reading.neighborhood({ subject, direction: 'both' })),
    (await lane.observe(createNodeContentObserver({ subject })).receipt).status,
    (await lane.observe(createEdgeContentObserver(edge)).receipt).status,
  ];
  const optic = (await captureCoordinate(lane)).optic();
  return [
    ...statuses,
    (await optic.node(subject).read()).alive,
    (await optic.node(subject).prop('title').read()).value,
    (await optic.neighborhood(subject).read()).edges,
    (await optic.traversal(subject).read({ maxDepth: 1, maxNodes: 2, maxEdges: 2 })).completeness,
  ];
}

/** The whole-Lane admission inventory, read from the cone admission index; returns its certified count. */
async function inventoried(lane: Lane): Promise<number> {
  const observation = lane.observe(createEntityAdmissionInventoryObserver('trap.inventory'));
  for await (const _admission of observation) { /* drain */ }
  return requireEntityAdmissionInventoryCertificate(await observation.receipt).admissionCount;
}

const READ_EVERY_KIND = ['completed', 'completed', 'completed', 'completed', 'completed', true, 'T', [], 'complete'];
const DERIVED = Array.from({ length: 10 }, () => 'derived');

it('drives every public entry point, worldline and strand, without reaching a whole-state trap', async () => {
  const runtime = await Runtime.open({ at: repository.tempDir, writer: 'alice' });
  try {
    const lane = await runtime.lane('events');
    for (let index = 0; index < 20; index += 1) {
      await lane.write(intent.node.add({ subject: `history${index}` }));
    }
    installTraps();
    expect(await writeEveryIntentKind(lane, EDGE, 'history3')).toEqual(DERIVED);
    expect(await readEveryKind(lane, EDGE, 'history3')).toEqual(READ_EVERY_KIND);
    expect(await inventoried(lane)).toBe(2);

    const strand = await runtime.fork(lane, { name: 'draft' });
    expect(await writeEveryIntentKind(strand, STRAND_EDGE, 'history5')).toEqual(DERIVED);
    expect(await readEveryKind(strand, STRAND_EDGE, 'history5')).toEqual(READ_EVERY_KIND);

    const preview = await runtime.previewSettlement({ source: strand, target: lane });
    expect(preview.outcome.kind).toBe('derived');
    expect((await runtime.settle(preview.plan)).outcome.kind).toBe('derived');
  } finally {
    await runtime.close();
  }
  const options = { repo: repository.tempDir, lane: 'events', strand: null, writer: 'alice', writerExplicit: true, json: true, jsonl: false, help: false };
  try {
    expect((await handleRepair({ options, args: ['--action', 'basis'] })).payload).toMatchObject({ status: 'completed' });
  } finally {
    await closeCliStorages();
  }
  expect(hits).toEqual([]);
});

it('arms traps that a whole-state path still reaches: the global checkpoint and a history walk', async () => {
  const runtime = await Runtime.open({ at: repository.tempDir, writer: 'alice' });
  try {
    const lane = await runtime.lane('events');
    await lane.write(intent.node.add({ subject: 'a' }));
    await lane.write(intent.node.add({ subject: 'b' }));
  } finally {
    await runtime.close();
  }
  installTraps();
  const host = await repository.openGraph('events', 'alice');
  await expect(async () => await host.materialize()).rejects.toThrow('trap: public path reached');
  expect(hits).toContain('RuntimeHost.materialize');
  const cas = ContentAddressableStore.createCbor({ plumbing: repository.plumbing, applicationRefPrefixes: ['refs/warp/'] });
  const journal = new CborPatchJournalAdapter({
    assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: repository.persistence, graph: 'events',
  });
  const history = journal.scanPatchHistory('alice', await repository.persistence.readRef('refs/warp/events/writers/alice') ?? '');
  await expect((async () => { for await (const _entry of history) { /* walk */ } })()).rejects.toThrow('beyond the head');
});
