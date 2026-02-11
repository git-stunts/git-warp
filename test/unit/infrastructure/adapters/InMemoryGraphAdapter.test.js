import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
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
    await expect(adapter.configSet('warp.key', /** @type {any} */ (42)))
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

    const chunks = [];
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
});
