import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore from '@git-stunts/git-cas';
import { Runtime } from '../../../index.ts';
import { intent } from '../../../advanced.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import captureObservedWriteBasis from '../../../src/domain/services/captureObservedWriteBasis.ts';
import VersionVector from '../../../src/domain/crdt/VersionVector.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';

const COMMAND_TIMEOUT_MS = 60_000;
const CASE_TIMEOUT_MS = 120_000;
const CHILD = fileURLToPath(new URL('./fixtures/ObservedWriterProcess.ts', import.meta.url));
const CLI = fileURLToPath(new URL('../../../dist/bin/git-warp.js', import.meta.url));
const CASES = [
  { format: 'sha1', writers: 1 }, { format: 'sha1', writers: 16 }, { format: 'sha1', writers: 64 },
  { format: 'sha256', writers: 1 }, { format: 'sha256', writers: 16 }, { format: 'sha256', writers: 64 },
];

async function fixture(format: string) {
  const directory = await mkdtemp(join(tmpdir(), 'observed-cost-'));
  try {
    const plumbing = await Plumbing.createDefault({ cwd: directory });
    await plumbing.execute({ args: ['init', `--object-format=${format}`] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@example.invalid'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Observed cost fixture'] });
    const runtime = await Runtime.open({ at: directory, writer: 'bootstrap' });
    try { await runtime.lane('L'); } finally { await runtime.close(); }
    const history = new GitTimelineHistoryAdapter({ plumbing });
    const cas = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
    const journal = new CborPatchJournalAdapter({
      assetStorage: new GitCasAssetStorageAdapter({ cas }), cas, codec, commitReader: history, graph: 'L',
    });
    return { directory, history, cas, journal };
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}

async function seed(journal: CborPatchJournalAdapter, writers: number): Promise<Map<string, string>> {
  const frontier = new Map<string, string>();
  for (let index = 0; index < writers; index++) {
    const writer = `seed-${index}`;
    const published = await journal.appendPatch({
      patch: new Patch({ writer, lamport: index + 1, context: {},
        ops: [new NodeAdd('n', new Dot(writer, 1)), new NodePropSet('n', 'value', `seed-${index}`)] }),
      graph: 'L', writer, targetRef: `refs/warp/L/writers/${writer}`,
      expectedHead: null, parent: null, attachments: [],
    });
    frontier.set(writer, published.sha);
  }
  return frontier;
}

async function capture(fields: Awaited<ReturnType<typeof fixture>>, writers: number) {
  const headReads = vi.spyOn(fields.history, 'getNodeInfo');
  const decodedAssets = vi.spyOn(fields.journal, 'readPatch');
  const rangeReads = vi.spyOn(fields.journal, 'scanPatchRange');
  const historyDrains = vi.spyOn(fields.history, 'logNodesStream');
  try {
    const start = performance.now();
    const basis = await captureObservedWriteBasis({
      refs: fields.history, journal: fields.journal, graphName: 'L', writerId: 'fresh',
      expectedParentSha: null, ownCandidate: 1, context: VersionVector.empty(),
    });
    const milliseconds = performance.now() - start;
    expect(headReads).toHaveBeenCalledTimes(writers);
    expect(decodedAssets).toHaveBeenCalledTimes(writers);
    expect(rangeReads).not.toHaveBeenCalled();
    expect(historyDrains).not.toHaveBeenCalled();
    expect(basis.lamport).toBe(writers + 1);
    expect(basis.context().get('seed-0')).toBe(1);
    return { basis, milliseconds, headReads: headReads.mock.calls.length, decodedAssets: decodedAssets.mock.calls.length };
  } finally { headReads.mockRestore(); decodedAssets.mockRestore(); rangeReads.mockRestore(); historyDrains.mockRestore(); }
}

async function publish(directory: string) {
  const runtime = await Runtime.open({ at: directory, writer: 'fresh' });
  const materialization = vi.spyOn(RuntimeHost.prototype, 'materialize');
  try {
    const lane = await runtime.lane('L');
    const start = performance.now();
    const receipt = await lane.write(intent.property.set({ subject: 'n', key: 'value', value: 'FINAL' }));
    const milliseconds = performance.now() - start;
    expect(receipt.outcome.kind).toBe('derived');
    expect(materialization).not.toHaveBeenCalled();
    return milliseconds;
  } finally { materialization.mockRestore(); await runtime.close(); }
}

function independentRead(directory: string): void {
  execFileSync(process.execPath, [CLI, 'repair', '--repo', directory, '--lane', 'L',
    '--writer', 'maintenance', '--action', 'materialization'], { timeout: COMMAND_TIMEOUT_MS, stdio: 'pipe' });
  execFileSync(process.execPath, [CHILD, directory, 'reader', 'observe', 'FINAL'], {
    timeout: COMMAND_TIMEOUT_MS, stdio: 'pipe',
  });
}

it.each(CASES)('records bounded native capture/write cost: $format / $writers writers', async ({ format, writers }) => {
  const fields = await fixture(format);
  try {
    const frontier = await seed(fields.journal, writers);
    const observed = await capture(fields, writers);
    expect(observed.basis.observation.frontier()).toEqual(frontier);
    const writeMilliseconds = await publish(fields.directory);
    const publishedWriterHeads = (await fields.history.listRefs('refs/warp/L/writers/')).length;
    console.log('NATIVE_OBSERVATION_COST', {
      format, writers, publishedWriterHeads, captureMilliseconds: observed.milliseconds, writeMilliseconds,
      headReads: observed.headReads, decodedAssets: observed.decodedAssets,
      processLifetimeMaximumRssKiB: process.resourceUsage().maxRSS,
      sampledHeapBytes: process.memoryUsage().heapUsed,
    });
    independentRead(fields.directory);
  } finally { await fields.cas.close(); await rm(fields.directory, { recursive: true, force: true }); }
}, CASE_TIMEOUT_MS);
