/**
 * Shared conformance suite for GraphPersistencePort adapters.
 *
 * Call `describeAdapterConformance(name, createAdapter, cleanupAdapter)` to
 * wire these tests against any adapter that implements GraphPersistencePort.
 *
 * @module test/unit/infrastructure/adapters/AdapterConformance
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import GitLogParser from '../../../../src/domain/services/GitLogParser.js';

/**
 * @param {string} name - Adapter display name for describe blocks
 * @param {() => Promise<{adapter: any, cleanup?: () => Promise<void>}>} factory
 */
export function describeAdapterConformance(name, factory) {
  describe(`${name} conformance`, () => {
    /** @type {any} */
    let adapter;
    /** @type {(() => Promise<void>)|undefined} */
    let cleanup;

    beforeEach(async () => {
      const result = await factory();
      adapter = result.adapter;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      if (cleanup) {
        await cleanup();
      }
    });

    // ── CommitPort ──────────────────────────────────────────────────

    describe('CommitPort', () => {
      it('commitNode returns a hex SHA', async () => {
        const sha = await adapter.commitNode({ message: 'test commit' });
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
      });

      it('commitNode supports parent chains', async () => {
        const parent = await adapter.commitNode({ message: 'parent' });
        const child = await adapter.commitNode({ message: 'child', parents: [parent] });
        expect(child).toMatch(/^[0-9a-f]{40}$/);
        expect(child).not.toBe(parent);
      });

      it('showNode round-trips the message', async () => {
        const message = 'hello world\nwith newlines';
        const sha = await adapter.commitNode({ message });
        const retrieved = await adapter.showNode(sha);
        // Git adds a trailing newline; trim for comparison
        expect(retrieved.trim()).toBe(message);
      });

      it('showNode throws on missing commit', async () => {
        const fakeSha = 'dead' + '0'.repeat(36);
        await expect(adapter.showNode(fakeSha)).rejects.toThrow();
      });

      it('getNodeInfo returns metadata', async () => {
        const parent = await adapter.commitNode({ message: 'parent msg' });
        const sha = await adapter.commitNode({ message: 'child msg', parents: [parent] });
        const info = await adapter.getNodeInfo(sha);
        expect(info.sha).toBe(sha);
        expect(info.message.trim()).toContain('child msg');
        expect(info.author).toBeTruthy();
        expect(info.date).toBeTruthy();
        expect(info.parents).toContain(parent);
      });

      it('nodeExists returns true for existing commit', async () => {
        const sha = await adapter.commitNode({ message: 'exists' });
        expect(await adapter.nodeExists(sha)).toBe(true);
      });

      it('nodeExists returns false for missing commit', async () => {
        const fakeSha = 'beef' + '0'.repeat(36);
        expect(await adapter.nodeExists(fakeSha)).toBe(false);
      });

      it('countNodes counts the full chain', async () => {
        const a = await adapter.commitNode({ message: 'a' });
        const b = await adapter.commitNode({ message: 'b', parents: [a] });
        const c = await adapter.commitNode({ message: 'c', parents: [b] });
        await adapter.updateRef('refs/warp/test/writers/w1', c);
        const count = await adapter.countNodes('refs/warp/test/writers/w1');
        expect(count).toBe(3);
      });

      it('ping returns ok', async () => {
        const result = await adapter.ping();
        expect(result.ok).toBe(true);
        expect(typeof result.latencyMs).toBe('number');
      });

      it('commitNodeWithTree creates a commit with a custom tree', async () => {
        const blobOid = await adapter.writeBlob('content');
        const treeOid = await adapter.writeTree([`100644 blob ${blobOid}\tfile.txt`]);
        const sha = await adapter.commitNodeWithTree({ treeOid, message: 'tree commit' });
        expect(sha).toMatch(/^[0-9a-f]{40}$/);
        const msg = await adapter.showNode(sha);
        expect(msg.trim()).toContain('tree commit');
      });

      it('logNodesStream is parseable by GitLogParser', async () => {
        const a = await adapter.commitNode({ message: 'first commit' });
        const b = await adapter.commitNode({ message: 'second commit', parents: [a] });
        await adapter.updateRef('refs/warp/test/writers/log', b);

        const format = '%H%n%an <%ae>%n%aI%n%P%n%B';
        const stream = await adapter.logNodesStream({
          ref: 'refs/warp/test/writers/log',
          limit: 10,
          format,
        });

        const parser = new GitLogParser();
        const nodes = [];
        for await (const node of parser.parse(stream)) {
          nodes.push(node);
        }
        expect(nodes.length).toBe(2);
        expect(nodes[0].sha).toBe(b);
        expect(nodes[1].sha).toBe(a);
      });
    });

    // ── BlobPort ────────────────────────────────────────────────────

    describe('BlobPort', () => {
      it('writeBlob + readBlob round-trip', async () => {
        const content = Buffer.from('hello blob');
        const oid = await adapter.writeBlob(content);
        expect(oid).toMatch(/^[0-9a-f]{40}$/);
        const retrieved = await adapter.readBlob(oid);
        expect(Buffer.compare(retrieved, content)).toBe(0);
      });

      it('content-addressing: same content = same OID', async () => {
        const oid1 = await adapter.writeBlob('same');
        const oid2 = await adapter.writeBlob('same');
        expect(oid1).toBe(oid2);
      });

      // readBlob behavior on missing OID varies by adapter
      // (Git may return empty buffer vs throw). Tested per-adapter.
    });

    // ── TreePort ────────────────────────────────────────────────────

    describe('TreePort', () => {
      it('emptyTree is the well-known constant', () => {
        expect(adapter.emptyTree).toBe('4b825dc642cb6eb9a060e54bf8d69288fbee4904');
      });

      it('writeTree + readTreeOids round-trip', async () => {
        const oid = await adapter.writeBlob('tree content');
        const treeOid = await adapter.writeTree([`100644 blob ${oid}\tindex.json`]);
        expect(treeOid).toMatch(/^[0-9a-f]{40}$/);
        const oids = await adapter.readTreeOids(treeOid);
        expect(oids['index.json']).toBe(oid);
      });

      it('writeTree + readTree resolves blob content', async () => {
        const content = Buffer.from('resolved content');
        const blobOid = await adapter.writeBlob(content);
        const treeOid = await adapter.writeTree([`100644 blob ${blobOid}\tdata.bin`]);
        const files = await adapter.readTree(treeOid);
        expect(Buffer.compare(files['data.bin'], content)).toBe(0);
      });
    });

    // ── RefPort ─────────────────────────────────────────────────────

    describe('RefPort', () => {
      it('updateRef + readRef round-trip', async () => {
        const sha = await adapter.commitNode({ message: 'ref test' });
        await adapter.updateRef('refs/warp/test/writers/alice', sha);
        const result = await adapter.readRef('refs/warp/test/writers/alice');
        expect(result).toBe(sha);
      });

      it('readRef returns null for missing ref', async () => {
        const result = await adapter.readRef('refs/warp/doesnotexist');
        expect(result).toBeNull();
      });

      it('deleteRef removes the ref', async () => {
        const sha = await adapter.commitNode({ message: 'delete me' });
        await adapter.updateRef('refs/warp/test/writers/del', sha);
        await adapter.deleteRef('refs/warp/test/writers/del');
        const result = await adapter.readRef('refs/warp/test/writers/del');
        expect(result).toBeNull();
      });

      it('listRefs filters by prefix', async () => {
        const sha = await adapter.commitNode({ message: 'list' });
        await adapter.updateRef('refs/warp/g1/writers/alice', sha);
        await adapter.updateRef('refs/warp/g1/writers/bob', sha);
        await adapter.updateRef('refs/warp/g2/writers/carol', sha);

        const g1Refs = await adapter.listRefs('refs/warp/g1/writers/');
        expect(g1Refs).toContain('refs/warp/g1/writers/alice');
        expect(g1Refs).toContain('refs/warp/g1/writers/bob');
        expect(g1Refs).not.toContain('refs/warp/g2/writers/carol');
      });
    });

    // ── ConfigPort ──────────────────────────────────────────────────

    describe('ConfigPort', () => {
      it('configSet + configGet round-trip', async () => {
        await adapter.configSet('warp.test.key', 'value123');
        const value = await adapter.configGet('warp.test.key');
        expect(value).toBe('value123');
      });

      it('configGet returns null for unset key', async () => {
        const value = await adapter.configGet('warp.unset.key');
        expect(value).toBeNull();
      });
    });

    // ── Validation ──────────────────────────────────────────────────

    describe('Validation', () => {
      it('rejects bad OID', async () => {
        await expect(adapter.showNode('not-hex!')).rejects.toThrow(/Invalid OID/);
      });

      it('rejects empty OID', async () => {
        await expect(adapter.showNode('')).rejects.toThrow(/non-empty string/);
      });

      it('rejects bad ref', async () => {
        await expect(adapter.readRef('--malicious')).rejects.toThrow(/Invalid ref/);
      });

      it('rejects empty ref', async () => {
        await expect(adapter.readRef('')).rejects.toThrow(/non-empty string/);
      });

      it('rejects bad limit', async () => {
        await expect(adapter.logNodes({ ref: 'HEAD', limit: -1 }))
          .rejects.toThrow(/positive integer/);
      });

      it('rejects non-integer limit', async () => {
        await expect(adapter.logNodes({ ref: 'HEAD', limit: 1.5 }))
          .rejects.toThrow(/integer/);
      });

      it('rejects bad config key', async () => {
        await expect(adapter.configGet('123invalid')).rejects.toThrow(/Invalid config key/);
      });

      it('rejects empty config key', async () => {
        await expect(adapter.configGet('')).rejects.toThrow(/non-empty string/);
      });
    });
  });
}
