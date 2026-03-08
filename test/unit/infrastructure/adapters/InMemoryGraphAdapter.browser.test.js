import { describe, it, expect } from 'vitest';
import InMemoryGraphAdapter from '../../../../src/infrastructure/adapters/InMemoryGraphAdapter.js';
import { sha1sync } from '../../../../src/infrastructure/adapters/sha1sync.js';
import WarpGraph from '../../../../src/domain/WarpGraph.js';
import WebCryptoAdapter from '../../../../src/infrastructure/adapters/WebCryptoAdapter.js';

describe('InMemoryGraphAdapter with injected hash (browser simulation)', () => {
  it('basic operations work with sha1sync hash function', async () => {
    const adapter = new InMemoryGraphAdapter({ hash: sha1sync });

    const blobOid = await adapter.writeBlob('hello');
    const content = await adapter.readBlob(blobOid);
    expect(new TextDecoder().decode(content)).toBe('hello');

    const sha = await adapter.commitNode({ message: 'test commit' });
    expect(sha).toMatch(/^[0-9a-f]{40}$/);

    const info = await adapter.getNodeInfo(sha);
    expect(info.message).toBe('test commit');
  });

  it('produces identical SHAs to default node:crypto hash', async () => {
    const clock = { now: () => 42 };
    const injected = new InMemoryGraphAdapter({ hash: sha1sync, clock });
    const defaultAdapter = new InMemoryGraphAdapter({ clock });

    const sha1 = await injected.commitNode({ message: 'deterministic' });
    const sha2 = await defaultAdapter.commitNode({ message: 'deterministic' });
    expect(sha1).toBe(sha2);
  });

  it('WarpGraph works with injected hash and WebCryptoAdapter', async () => {
    const persistence = new InMemoryGraphAdapter({ hash: sha1sync });
    const crypto = new WebCryptoAdapter();
    const graph = await WarpGraph.open({
      persistence,
      graphName: 'browser-test',
      writerId: 'alice',
      crypto,
    });

    const patch = await graph.createPatch();
    patch.addNode('user:alice');
    patch.setProperty('user:alice', 'name', 'Alice');
    await patch.commit();

    /** @type {any} */
    const state = await graph.materialize();
    expect(state.nodeAlive.entries.has('user:alice')).toBe(true);
  });
});
