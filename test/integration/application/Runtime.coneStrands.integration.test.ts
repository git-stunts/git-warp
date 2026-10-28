import { execFileSync } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Runtime, type Lane, type ReadingValue } from '../../../index.ts';
import { captureCoordinate, createObserver, intent, reading } from '../../../advanced.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * Fork, strand Lanes, settlement and saved Coordinates over cone bases
 * (#1039), through the public Runtime on real disposable repositories.
 */

const STRAND_ID = /^[0-9a-f]{64}$/u;

let repository: Awaited<ReturnType<typeof createTestRepo>>;
beforeEach(async () => {
  repository = await createTestRepo('cone-strands');
});
afterEach(async () => {
  await repository.cleanup();
});

async function git(...args: string[]): Promise<string> {
  return (await repository.plumbing.execute({ args })).trim();
}

async function objectExists(oid: string): Promise<boolean> {
  try {
    await git('cat-file', '-e', oid);
    return true;
  } catch {
    return false;
  }
}

async function value(lane: Lane, subject: string, key: string): Promise<ReadingValue> {
  return (await lane.observe(createObserver('cone.value', reading.property({ subject, key }), (raw: ReadingValue) => raw)).one()).value;
}

async function exists(lane: Lane, subject: string): Promise<ReadingValue> {
  return (await lane.observe(createObserver('cone.exists', reading.node.exists({ subject }), (raw: ReadingValue) => raw)).one()).value;
}

async function neighbours(lane: Lane, subject: string): Promise<ReadingValue> {
  const observer = createObserver('cone.neighbours', reading.neighborhood({ subject, direction: 'both' }), (raw: ReadingValue) => raw);
  return (await lane.observe(observer).one()).value;
}

async function withRuntime<T>(writer: string, run: (runtime: Runtime, lane: Lane) => Promise<T>): Promise<T> {
  const runtime = await Runtime.open({ at: repository.tempDir, writer });
  try {
    return await run(runtime, await runtime.lane('events'));
  } finally {
    await runtime.close();
  }
}

async function strandRefs(): Promise<string[]> {
  const listing = await git('for-each-ref', '--format=%(refname)', 'refs/warp/events/cone/strands/');
  return listing === '' ? [] : listing.split('\n');
}

describe('fork and strand Lanes over cone bases', () => {
  it('forks at a pinned cone basis, reads the base and keeps strand and lane writes apart', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      await lane.write([intent.node.add({ subject: 'doc' }), intent.node.add({ subject: 'tag' }),
        intent.edge.add({ from: 'doc', to: 'tag', label: 'tagged' })]);
      await lane.write(intent.property.set({ subject: 'doc', key: 'title', value: 'base' }));
      const strand = await runtime.fork(lane, { name: 'draft' });
      const [base, head] = await strandRefs();
      expect(base).toMatch(/cone\/strands\/[0-9a-f]{64}\/base$/u);
      expect(head).toBeUndefined();
      expect(await git('rev-parse', base ?? '')).toBe(await git('rev-parse', 'refs/warp/events/cone/head'));
      expect(await git('for-each-ref', '--format=%(refname)', 'refs/warp/events/checkpoints/')).toBe('');

      await lane.write(intent.property.set({ subject: 'doc', key: 'title', value: 'lane' }));
      expect(await value(strand, 'doc', 'title')).toBe('base');
      await strand.write([intent.property.set({ subject: 'doc', key: 'title', value: 'strand' }),
        intent.edge.remove({ from: 'doc', to: 'tag', label: 'tagged' })]);
      expect(await value(strand, 'doc', 'title')).toBe('strand');
      expect(await neighbours(strand, 'doc')).toMatchObject({ edges: [] });
      expect(await value(lane, 'doc', 'title')).toBe('lane');
      expect(await neighbours(lane, 'doc')).toMatchObject({ edges: [{ neighborId: 'tag', label: 'tagged' }] });
      expect(await strandRefs()).toHaveLength(2);
    });
  });

  it('shares every record the strand never touched with its base root', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      await lane.write([intent.node.add({ subject: 'kept' }), intent.node.add({ subject: 'changed' })]);
      const strand = await runtime.fork(lane, { name: 'draft' });
      await strand.write(intent.property.set({ subject: 'changed', key: 'k', value: 1 }));
      const [base, head] = await strandRefs();
      const records = async (ref: string): Promise<Map<string, string>> => new Map((await git('ls-tree', '-r', `${ref}:records`))
        .split('\n').map((line) => { const [meta = '', path = ''] = line.split('\t'); return [path, meta.split(' ')[2] ?? '']; }));
      const [baseRecords, strandRecords] = [await records(base ?? ''), await records(head ?? '')];
      const shared = [...baseRecords].filter(([path, oid]) => strandRecords.get(path) === oid);
      const changed = [...strandRecords].filter(([path, oid]) => baseRecords.get(path) !== oid);
      expect(shared.length).toBeGreaterThan(0);
      expect(changed.length).toBeLessThanOrEqual(3);
      expect(await exists(strand, 'kept')).toBe(true);
    });
  });

  it('reopens a strand in a later Runtime, and refolds its base when the pin is gone', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      await lane.write(intent.node.add({ subject: 'doc' }));
      const strand = await runtime.fork(lane, { name: 'draft' });
      await strand.write(intent.property.set({ subject: 'doc', key: 'title', value: 'strand' }));
      await lane.write(intent.property.set({ subject: 'doc', key: 'title', value: 'lane' }));
    });
    const [base] = await strandRefs();
    await withRuntime('alice', async (runtime, lane) => {
      const strand = await runtime.strand(lane, { name: 'draft' });
      expect(await value(strand, 'doc', 'title')).toBe('strand');
    });
    await git('update-ref', '-d', base ?? '');
    await git('update-ref', '-d', (base ?? '').replace(/base$/u, 'head'));
    await withRuntime('alice', async (runtime, lane) => {
      const strand = await runtime.strand(lane, { name: 'draft' });
      expect(await value(strand, 'doc', 'title')).toBe('strand');
      expect(await strandRefs()).toHaveLength(2);
    });
  });

  it('removes an edge and a node added earlier in the same atomic write', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      const receipt = await lane.write([
        intent.node.add({ subject: 'a' }), intent.node.add({ subject: 'b' }), intent.node.add({ subject: 'gone' }),
        intent.edge.add({ from: 'a', to: 'b', label: 'rel' }),
        intent.edge.remove({ from: 'a', to: 'b', label: 'rel' }),
        intent.node.remove({ subject: 'gone' }),
      ]);
      expect(receipt.outcome.kind).toBe('derived');
      expect(await neighbours(lane, 'a')).toMatchObject({ edges: [] });
      expect(await exists(lane, 'gone')).toBe(false);
      expect(await exists(lane, 'b')).toBe(true);
      const strand = await runtime.fork(lane, { name: 'draft' });
      expect((await strand.write([intent.edge.add({ from: 'a', to: 'b', label: 'rel' }),
        intent.edge.remove({ from: 'a', to: 'b', label: 'rel' })])).outcome.kind).toBe('derived');
      expect(await neighbours(strand, 'a')).toMatchObject({ edges: [] });
    });
  });
});

describe('settlement over cone bases', () => {
  it('keeps a preview derived across a basis refresh with no new patches, and settles it', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      await lane.write(intent.node.add({ subject: 'user:alice' }));
      const strand = await runtime.fork(lane, { name: 'promote' });
      await strand.write(intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' }));
      const preview = await runtime.previewSettlement({ source: strand, target: lane });
      expect(preview.outcome.kind).toBe('derived');

      const host = await repository.openGraph('events', 'alice');
      await host.materialize();
      await host.createCheckpoint();
      await git('update-ref', '-d', 'refs/warp/events/cone/head');
      expect(await exists(lane, 'user:alice')).toBe(true);

      const again = await runtime.previewSettlement({ source: strand, target: lane });
      expect(again.outcome.kind).toBe('derived');
      expect(again.plan.planDigest).toBe(preview.plan.planDigest);
      expect((await runtime.settle(preview.plan)).outcome.kind).toBe('derived');
      expect(await value(lane, 'user:alice', 'role')).toBe('admin');
    });
  });

  it('settles over target writes to other elements and refuses writes to the same element', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      await lane.write([intent.node.add({ subject: 'user:alice' }), intent.node.add({ subject: 'user:bob' })]);
      const strand = await runtime.fork(lane, { name: 'promote' });
      await strand.write(intent.property.set({ subject: 'user:alice', key: 'role', value: 'admin' }));
      await lane.write(intent.property.set({ subject: 'user:bob', key: 'role', value: 'owner' }));
      const unrelated = await runtime.previewSettlement({ source: strand, target: lane });
      expect(unrelated.outcome.kind).toBe('derived');
      expect(unrelated.evidence.support.length).toBeGreaterThan(5);

      await lane.write(intent.property.set({ subject: 'user:alice', key: 'role', value: 'member' }));
      const touched = await runtime.previewSettlement({ source: strand, target: lane });
      expect(touched.outcome.kind).toBe('obstruction');
      expect(touched.outcome.kind === 'obstruction' ? touched.outcome.witness.reason.code : '')
        .toBe('git-warp.settlement-common-basis-required');
      expect((await runtime.settle(unrelated.plan)).outcome.kind).toBe('obstruction');
      expect((await runtime.settle(touched.plan)).outcome.kind).toBe('obstruction');
      expect(await value(lane, 'user:alice', 'role')).toBe('member');
    });
  });
});

describe('saved Coordinates over cone bases', () => {
  it('keep reading their pinned basis after the lane moves on and git gc --prune=now runs', async () => {
    await withRuntime('alice', async (runtime, lane) => {
      await lane.write([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'v', value: 1 })]);
      const saved = await captureCoordinate(lane);
      await lane.write(intent.property.set({ subject: 'doc', key: 'v', value: 2 }));
      const unretained = await git('rev-parse', 'refs/warp/events/cone/head:records');
      await lane.write(intent.property.set({ subject: 'doc', key: 'v', value: 3 }));
      const strand = await runtime.fork(lane, { name: 'draft' });
      await strand.write(intent.property.set({ subject: 'doc', key: 'v', value: 'strand' }));
      const strandSaved = await captureCoordinate(strand);
      await strand.write(intent.property.set({ subject: 'doc', key: 'v', value: 'later' }));

      // The plumbing adapter refuses gc; run the real command against the disposable repository.
      execFileSync('git', ['gc', '--prune=now', '--quiet'], { cwd: repository.tempDir, stdio: 'ignore' });

      expect(await objectExists(saved.coneRoot)).toBe(true);
      expect(await objectExists(unretained)).toBe(false);
      expect((await saved.optic().node('doc').prop('v').read()).value).toBe(1);
      expect((await strandSaved.optic().node('doc').prop('v').read()).value).toBe('strand');
      expect(strandSaved.frontierEntries.some(({ writerId }) => /^@w\.alice@s\./u.test(writerId))).toBe(true);
      expect(await git('for-each-ref', '--format=%(refname)', 'refs/warp/events/cone/retained')).toBe('refs/warp/events/cone/retained');
      expect((await git('ls-tree', 'refs/warp/events/cone/retained:r')).split('\n')).toHaveLength(2);
      expect(STRAND_ID.test(strandSaved.frontierEntries[0]?.writerId.slice(-64) ?? '')).toBe(true);
    });
  });
});
