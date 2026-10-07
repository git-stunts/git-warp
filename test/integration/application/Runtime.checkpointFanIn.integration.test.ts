import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
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
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';

const MAX_PUBLICATION_PARENTS = 64;
const COMMAND_TIMEOUT_MS = 60_000;
const CASE_TIMEOUT_MS = 120_000;
const CLI = fileURLToPath(new URL('../../../dist/bin/git-warp.js', import.meta.url));
const READER = fileURLToPath(new URL('./fixtures/CheckpointFanInReader.ts', import.meta.url));
const CASES = ['sha1', 'sha256'].flatMap(format => [63, 64, 65, 129].map(writers => ({ format, writers })));

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
    execFileSync(process.execPath, [READER, fields.directory, `seed-${writers - 1}`], {
      timeout: COMMAND_TIMEOUT_MS, stdio: 'pipe',
    });
    repair(fields.directory);
    for (const [writer, sha] of frontier) { expect(await fields.history.readRef(`refs/warp/L/writers/${writer}`)).toBe(sha); }
  } finally { await fields.cas.close(); await rm(fields.directory, { recursive: true, force: true }); }
}, CASE_TIMEOUT_MS);
