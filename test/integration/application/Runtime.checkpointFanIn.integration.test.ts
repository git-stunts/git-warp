import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';
import Plumbing from '@git-stunts/plumbing';
import ContentAddressableStore from '@git-stunts/git-cas';
import { Runtime } from '../../../index.ts';
import Patch from '../../../src/domain/types/Patch.ts';
import { Dot } from '../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../src/domain/types/ops/NodeAdd.ts';
import NodePropSet from '../../../src/domain/types/ops/NodePropSet.ts';
import { CborPatchJournalAdapter } from '../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import GitCasAssetStorageAdapter from '../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitTimelineHistoryAdapter from '../../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import { CborCheckpointStoreAdapter } from '../../../src/infrastructure/adapters/CborCheckpointStoreAdapter.ts';
import NodeCryptoAdapter from '../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCheckpointStoreAdapter as BaselineCheckpointReader } from './fixtures/CheckpointStoreBaseline.ts';
import GitCasMaterializationStoreAdapter from '../../../src/infrastructure/adapters/GitCasMaterializationStoreAdapter.ts';
import MaterializationCoordinate from '../../../src/domain/materialization/MaterializationCoordinate.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';

const MAX_PUBLICATION_PARENTS = 64;
const COMMAND_TIMEOUT_MS = 60_000;
const CASE_TIMEOUT_MS = 120_000;
const CLI = fileURLToPath(new URL('../../../dist/bin/git-warp.js', import.meta.url));
const READER = fileURLToPath(new URL('./fixtures/CheckpointFanInReader.ts', import.meta.url));
const CASES = ['sha1', 'sha256'].flatMap(format => [63, 64, 65, 129].map(writers => ({ format, writers })));

function checkpointDependencies(history: GitTimelineHistoryAdapter, cas: ContentAddressableStore) {
  return { history, cas, codec, crypto: new NodeCryptoAdapter(), commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC };
}

it.each(['sha1', 'sha256'])('preserves provider refusal for abbreviated parents: %s', async format => {
  const fields = await fixture(format);
  const materializations = new GitCasMaterializationStoreAdapter({
    cas: fields.cas, codec, crypto: new NodeCryptoAdapter(), laneName: 'L',
  });
  try {
    const frontier = await seed(fields.journal, 65);
    repair(fields.directory);
    const store = new CborCheckpointStoreAdapter(checkpointDependencies(fields.history, fields.cas));
    const old = await store.resolveHead('L');
    if (old === null) { throw new Error('Expected checkpoint'); }
    const loaded = await store.loadCheckpoint(old, 'L');
    const acquired = await materializations.acquireExact(new MaterializationCoordinate({ frontier, ceiling: null }));
    if (acquired === null) { throw new Error('Expected retained materialization'); }
    try {
      const parents = [...frontier.values()].map((sha, index) => index === 0 ? sha.slice(0, 12) : sha);
      const commit = vi.spyOn(fields.history, 'commitNode');
      await expect(store.publishCheckpoint({
        graphName: 'L', state: loaded.state, frontier, stateHash: loaded.stateHash,
        appliedVV: loaded.state.observedFrontier, materialization: acquired.materialization,
        parents, expectedCheckpointSha: old,
      })).rejects.toMatchObject({ code: 'PUBLICATION_INVALID' });
      expect(commit).not.toHaveBeenCalled();
      expect(await store.resolveHead('L')).toBe(old);
    } finally { await acquired.release(); }
  } finally {
    await materializations.close(); await fields.history.close(); await fields.cas.close();
    await rm(fields.directory, { recursive: true, force: true });
  }
}, CASE_TIMEOUT_MS);

it.each(['sha1', 'sha256'])('creates native empty-tree anchors: %s', async format => {
  const fields = await fixture(format);
  try {
    const sha = await fields.history.commitNode({ message: 'empty-tree anchor' });
    const tree = await fields.history.getCommitTree(sha);
    expect(tree).toBe(await fields.history.writeTree([]));
    expect(tree).toHaveLength(format === 'sha1' ? 40 : 64);
    expect(await fields.history.readTreeOids(tree)).toEqual({});
  } finally {
    await fields.cas.close();
    await fields.history.close();
    await rm(fields.directory, { recursive: true, force: true });
  }
}, CASE_TIMEOUT_MS);

async function fixture(format: string) {
  const directory = await mkdtemp(join(tmpdir(), 'checkpoint-fan-in-'));
  try {
    const plumbing = await Plumbing.createDefault({ cwd: directory });
    await plumbing.execute({ args: ['init', `--object-format=${format}`] });
    await plumbing.execute({ args: ['config', 'user.email', 'test@example.invalid'] });
    await plumbing.execute({ args: ['config', 'user.name', 'Checkpoint fan-in fixture'] });
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

function repair(directory: string): void {
  execFileSync(process.execPath, [CLI, 'repair', '--repo', directory, '--lane', 'L',
    '--writer', 'maintenance', '--action', 'materialization'], { timeout: COMMAND_TIMEOUT_MS, stdio: 'pipe' });
}

async function retainedHeads(history: GitTimelineHistoryAdapter, checkpoint: string): Promise<Set<string>> {
  const visited = new Set<string>();
  const pending = [checkpoint];
  for (let current = pending.pop(); current !== undefined; current = pending.pop()) {
    if (visited.has(current)) { continue; }
    visited.add(current);
    const entry = await history.getNodeInfo(current);
    expect(entry.parents.length).toBeLessThanOrEqual(MAX_PUBLICATION_PARENTS);
    pending.push(...entry.parents);
  }
  return visited;
}

it.each(CASES)('publishes and retains a bounded checkpoint: $format / $writers writer heads', async ({ format, writers }) => {
  const fields = await fixture(format);
  try {
    const frontier = await seed(fields.journal, writers);
    repair(fields.directory);
    const checkpoint = await fields.history.readRef('refs/warp/L/checkpoints/head');
    expect(checkpoint).not.toBeNull();
    if (checkpoint === null) { throw new Error('Repair did not publish a checkpoint'); }
    const reachable = await retainedHeads(fields.history, checkpoint);
    for (const sha of frontier.values()) { expect(reachable.has(sha)).toBe(true); }
    const store = new CborCheckpointStoreAdapter(checkpointDependencies(fields.history, fields.cas));
    const loaded = await store.loadCheckpoint(checkpoint, 'L');
    expect(loaded.frontier).toEqual(frontier);
    const baseline = new BaselineCheckpointReader(checkpointDependencies(fields.history, fields.cas));
    const oldData = await baseline.loadCheckpoint(checkpoint, 'L');
    expect(oldData.frontier).toEqual(frontier);
    expect(oldData.stateHash).toBe(loaded.stateHash);
    expect((await baseline.loadBasis(checkpoint, 'L')).frontier).toEqual(frontier);
    execFileSync(process.execPath, [READER, fields.directory, `seed-${writers - 1}`], {
      timeout: COMMAND_TIMEOUT_MS, stdio: 'pipe',
    });
    repair(fields.directory);
    for (const [writer, sha] of frontier) { expect(await fields.history.readRef(`refs/warp/L/writers/${writer}`)).toBe(sha); }
    const anchor = await store.publishCoverage({ graphName: 'L', parents: [...frontier.values()] });
    const coverage = await retainedHeads(fields.history, anchor);
    for (const sha of frontier.values()) { expect(coverage.has(sha)).toBe(true); }
    const finalCheckpoint = await store.resolveHead('L');
    if (finalCheckpoint === null) { throw new Error('Repeated repair lost the checkpoint'); }
    // Remove the parallel retention root so checkpoint ancestry is the GC oracle.
    await fields.history.compareAndDeleteRef('refs/warp/L/coverage/head', anchor);
    // Native retention witness, not a claim about a public writer-retirement API.
    for (const [writer, sha] of frontier) {
      await fields.history.compareAndDeleteRef(`refs/warp/L/writers/${writer}`, sha);
    }
    await fields.history.close();
    await fields.cas.close();
    const plumbing = await Plumbing.createDefault({ cwd: fields.directory });
    // Plumbing exposes storage primitives, not porcelain maintenance commands.
    execFileSync('git', ['-C', fields.directory, 'gc', '--prune=now'], {
      timeout: COMMAND_TIMEOUT_MS, stdio: 'pipe',
    });
    const reopenedHistory = new GitTimelineHistoryAdapter({ plumbing });
    const reopenedCas = ContentAddressableStore.createCbor({ plumbing, applicationRefPrefixes: ['refs/warp/'] });
    try {
      const retained = await retainedHeads(reopenedHistory, finalCheckpoint);
      for (const sha of frontier.values()) { expect(retained.has(sha)).toBe(true); }
      const reopenedBaseline = new BaselineCheckpointReader(checkpointDependencies(reopenedHistory, reopenedCas));
      const afterGc = await reopenedBaseline.loadCheckpoint(finalCheckpoint, 'L');
      expect(afterGc.frontier).toEqual(frontier);
      expect(afterGc.stateHash).toBe(loaded.stateHash);
      expect((await reopenedBaseline.loadBasis(finalCheckpoint, 'L')).frontier).toEqual(frontier);
    } finally { await reopenedHistory.close(); await reopenedCas.close(); }
  } finally {
    await fields.cas.close();
    await fields.history.close();
    await rm(fields.directory, { recursive: true, force: true });
  }
}, CASE_TIMEOUT_MS);
