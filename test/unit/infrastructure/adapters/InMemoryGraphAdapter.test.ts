import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.ts';
import { describeAdapterConformance } from './AdapterConformance.js';

// ── Conformance suite ───────────────────────────────────────────────────

describeAdapterConformance('InMemoryGraphAdapter', async () => ({
  adapter: new InMemoryGraphAdapter(),
}));

// ── InMemory-specific tests ─────────────────────────────────────────────

describe('InMemoryGraphAdapter specifics', () => {
  it('uses injected clock for commit dates', async () => {
    let t = 1000;
    const clock = { now: () => t++ };
    const adapter = new InMemoryGraphAdapter({ clock });
    const sha = await adapter.commitNode({ message: 'timed' });
    const info = await adapter.getNodeInfo(sha);
    expect(info.date).toBe(new Date(1000).toISOString());
  });

  it('uses injected author string', async () => {
    const adapter = new InMemoryGraphAdapter({ author: 'Alice <alice@test>' });
    const sha = await adapter.commitNode({ message: 'authored' });
    const info = await adapter.getNodeInfo(sha);
    expect(info.author).toBe('Alice <alice@test>');
  });

  it('content-addressable blobs return same OID', async () => {
    const adapter = new InMemoryGraphAdapter();
    const oid1 = await adapter.writeBlob('duplicate');
    const oid2 = await adapter.writeBlob('duplicate');
    expect(oid1).toBe(oid2);
  });

  it('different messages produce different commit SHAs', async () => {
    const clock = { now: () => 42 }; // fixed clock for determinism
    const adapter = new InMemoryGraphAdapter({ clock });
    const sha1 = await adapter.commitNode({ message: 'msg-a' });
    const sha2 = await adapter.commitNode({ message: 'msg-b' });
    expect(sha1).not.toBe(sha2);
  });

  it('ping always returns ok:true with latencyMs 0', async () => {
    const adapter = new InMemoryGraphAdapter();
    const result = await adapter.ping();
    expect(result).toEqual({ ok: true, latencyMs: 0 });
  });

  it('readTreeOids on empty tree returns empty object', async () => {
    const adapter = new InMemoryGraphAdapter();
    const result = await adapter.readTreeOids(adapter.emptyTree);
    expect(result).toEqual({});
  });

  it('readBlob throws for missing OID', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.readBlob('abcd' + '0'.repeat(36)))
      .rejects.toThrow(/Blob not found/);
  });

  it('writeBlob accepts Uint8Array content', async () => {
    const adapter = new InMemoryGraphAdapter();
    const oid = await adapter.writeBlob(new TextEncoder().encode('bytes'));
    await expect(adapter.readBlob(oid)).resolves.toEqual(new TextEncoder().encode('bytes'));
  });

  it('writeBlob rejects unsupported input types', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.writeBlob((42 as any)))
      .rejects.toThrow(/Expected string or Uint8Array/);
  });

  it('readTreeOids throws for missing tree', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.readTreeOids('abcd' + '0'.repeat(36)))
      .rejects.toThrow(/Tree not found/);
  });

  it('countNodes throws for missing ref', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.countNodes('refs/warp/missing'))
      .rejects.toThrow(/Ref not found/);
  });

  it('configSet rejects non-string value', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.configSet('warp.key', (42 as any)))
      .rejects.toThrow(/Config value must be a string/);
  });

  it('writeTree rejects malformed entry missing tab', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.writeTree(['100644 blob abcd0000000000000000000000000000000000 no-tab']))
      .rejects.toThrow(/missing tab/i);
  });

  it('_walkLog returns reverse chronological order for merge DAGs', async () => {
    let t = 1000;
    const clock = { now: () => t++ };
    const adapter = new InMemoryGraphAdapter({ clock });

    // Build a diamond DAG:  A -> B, A -> C, B+C -> D (merge)
    const a = await adapter.commitNode({ message: 'a' }); // t=1000
    const b = await adapter.commitNode({ message: 'b', parents: [a] }); // t=1001
    const c = await adapter.commitNode({ message: 'c', parents: [a] }); // t=1002
    const d = await adapter.commitNode({ message: 'd', parents: [b, c] }); // t=1003 (merge)
    await adapter.updateRef('refs/warp/test/writers/merge', d);

    const format = '%H%n%an <%ae>%n%aI%n%P%n%B';
    const stream = await adapter.logNodesStream({
      ref: 'refs/warp/test/writers/merge',
      limit: 10,
      format,
    });

    const chunks: any[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const records = chunks.join('').split('\0').filter(Boolean);

    // Should be reverse chronological: D (newest) first, A (oldest) last
    const shas = records.map(r => r.split('\n')[0]);
    expect(shas).toEqual([d, c, b, a]);
  });

  it('listRefs returns sorted results', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'sort' });
    await adapter.updateRef('refs/warp/z/w1', sha);
    await adapter.updateRef('refs/warp/a/w1', sha);
    await adapter.updateRef('refs/warp/m/w1', sha);
    const refs = await adapter.listRefs('refs/warp/');
    expect(refs).toEqual([
      'refs/warp/a/w1',
      'refs/warp/m/w1',
      'refs/warp/z/w1',
    ]);
  });

  it('listRefs without limit returns all refs', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'all' });
    await adapter.updateRef('refs/warp/g/w1', sha);
    await adapter.updateRef('refs/warp/g/w2', sha);
    await adapter.updateRef('refs/warp/g/w3', sha);
    const refs = await adapter.listRefs('refs/warp/g/');
    expect(refs).toEqual([
      'refs/warp/g/w1',
      'refs/warp/g/w2',
      'refs/warp/g/w3',
    ]);
  });

  it('listRefs with limit returns at most N refs', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'limited' });
    await adapter.updateRef('refs/warp/g/w1', sha);
    await adapter.updateRef('refs/warp/g/w2', sha);
    await adapter.updateRef('refs/warp/g/w3', sha);
    const refs = await adapter.listRefs('refs/warp/g/', { limit: 2 });
    expect(refs).toHaveLength(2);
    expect(refs).toEqual([
      'refs/warp/g/w1',
      'refs/warp/g/w2',
    ]);
  });

  it('listRefs with limit=0 returns all refs', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'zero' });
    await adapter.updateRef('refs/warp/g/w1', sha);
    await adapter.updateRef('refs/warp/g/w2', sha);
    const refs = await adapter.listRefs('refs/warp/g/', { limit: 0 });
    expect(refs).toEqual([
      'refs/warp/g/w1',
      'refs/warp/g/w2',
    ]);
  });

  it('listRefs with no limit option returns all refs', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'noop' });
    await adapter.updateRef('refs/warp/g/w1', sha);
    await adapter.updateRef('refs/warp/g/w2', sha);
    const refs = await adapter.listRefs('refs/warp/g/', {});
    expect(refs).toEqual([
      'refs/warp/g/w1',
      'refs/warp/g/w2',
    ]);
  });

  it('getNodeInfo throws for missing commit', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.getNodeInfo('abcd' + '0'.repeat(36)))
      .rejects.toThrow(/Commit not found/);
  });

  it('getCommitTree throws for missing commit', async () => {
    const adapter = new InMemoryGraphAdapter();
    await expect(adapter.getCommitTree('abcd' + '0'.repeat(36)))
      .rejects.toThrow(/Commit not found/);
  });

  it('logNodes uses default commit formatting when format is empty', async () => {
    const adapter = new InMemoryGraphAdapter({ author: 'Alice <alice@test>' });
    const sha = await adapter.commitNode({ message: 'hello' });
    await adapter.updateRef('refs/warp/test/writers/main', sha);

    const log = await adapter.logNodes({
      ref: 'refs/warp/test/writers/main',
      limit: 10,
      format: '',
    });

    expect(log).toContain(`commit ${sha}`);
    expect(log).toContain('Author: Alice <alice@test>');
    expect(log).toContain('hello');
  });

  it('logNodes returns NUL-separated records when a format string is provided', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'formatted' });
    await adapter.updateRef('refs/warp/test/writers/main', sha);

    const log = await adapter.logNodes({
      ref: 'refs/warp/test/writers/main',
      limit: 10,
      format: '%H',
    });

    expect(log.startsWith(`${sha}\n`)).toBe(true);
    expect(log.endsWith('\0')).toBe(true);
  });

  it('_resolveRef returns a raw SHA when the commit exists', async () => {
    const adapter = new InMemoryGraphAdapter();
    const sha = await adapter.commitNode({ message: 'raw-ref' });
    expect((adapter)._resolveRef(sha)).toBe(sha);
  });

  it('_walkLog returns empty array when the ref cannot be resolved', () => {
    const adapter = new InMemoryGraphAdapter();
    expect((adapter)._walkLog('refs/warp/missing', 10)).toEqual([]);
  });

  it('_collectCommits ignores missing commit SHAs in parent chains', async () => {
    const adapter = new InMemoryGraphAdapter();
    // Create a commit whose parent doesn't exist in the store.
    // The parent OID is valid hex but points to nothing.
    const orphan = await adapter.commitNode({ message: 'orphan', parents: ['abcd' + '0'.repeat(36)] });
    await adapter.updateRef('refs/test', orphan);
    // countNodes walks the DAG — it should count 1 (the orphan) and skip the missing parent.
    const count = await adapter.countNodes('refs/test');
    expect(count).toBe(1);
  });

  it('_countReachable does not double-count duplicated parent paths', async () => {
    let t = 2000;
    const clock = { now: () => t++ };
    const adapter = new InMemoryGraphAdapter({ clock });
    const root = await adapter.commitNode({ message: 'root' });
    const left = await adapter.commitNode({ message: 'left', parents: [root] });
    const right = await adapter.commitNode({ message: 'right', parents: [root] });
    const merge = await adapter.commitNode({ message: 'merge', parents: [left, right] });

    expect((adapter)._countReachable(merge)).toBe(4);
  });
});
