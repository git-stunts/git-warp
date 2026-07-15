import { describe, expect, it, vi } from 'vitest';

import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasAuditLogAdapter from '../../../../src/infrastructure/adapters/GitCasAuditLogAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const encoder = new TextEncoder();

function createFixture() {
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
  const auditCas = {
    assets: {
      put: vi.fn(cas.assets.put),
      adopt: vi.fn(cas.assets.adopt),
      open: vi.fn(cas.assets.open),
    },
    publications: cas.publications,
  };
  const log = new GitCasAuditLogAdapter({ history, cas: auditCas, assets });
  return { assets, auditCas, backing, cas, history, log };
}

describe('GitCasAuditLogAdapter', () => {
  it('publishes, lists, and reads causally retained audit receipts', async () => {
    const { log } = createFixture();
    const alice = await log.append({
      graphName: 'events',
      writerId: 'alice',
      expectedHead: null,
      parent: null,
      message: 'audit alice',
      receipt: encoder.encode('alice receipt'),
    });
    await log.append({
      graphName: 'events',
      writerId: 'bob',
      expectedHead: null,
      parent: null,
      message: 'audit bob',
      receipt: encoder.encode('bob receipt'),
    });

    expect(await log.readHead('events', 'alice')).toBe(alice.sha);
    expect(await log.listWriterIds('events')).toEqual(['alice', 'bob']);
    expect(alice.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: {
        kind: 'publication',
        generation: alice.sha,
      },
    });
    await expect(log.readEntry(alice.sha)).resolves.toMatchObject({
      sha: alice.sha,
      message: 'audit alice',
      parents: [],
      receipt: encoder.encode('alice receipt'),
    });
  });

  it('reads the legacy single-blob receipt tree through the compatibility path', async () => {
    const { auditCas, history, log } = createFixture();
    auditCas.assets.adopt.mockRejectedValueOnce(legacyTreeError());
    const receiptOid = await history.writeBlob(encoder.encode('legacy receipt'));
    const treeOid = await history.writeTree([
      `100644 blob ${receiptOid}\treceipt.cbor`,
    ]);
    const sha = await history.commitNodeWithTree({
      treeOid,
      parents: [],
      message: 'legacy audit',
    });

    await expect(log.readEntry(sha)).resolves.toMatchObject({
      sha,
      message: 'legacy audit',
      receipt: encoder.encode('legacy receipt'),
    });
  });

  it('rejects malformed legacy receipt trees without guessing', async () => {
    const { auditCas, history, log } = createFixture();
    auditCas.assets.adopt.mockRejectedValueOnce(legacyTreeError());
    const first = await history.writeBlob(encoder.encode('first'));
    const second = await history.writeBlob(encoder.encode('second'));
    const treeOid = await history.writeTree([
      `100644 blob ${first}\treceipt.cbor`,
      `100644 blob ${second}\textra.cbor`,
    ]);
    const sha = await history.commitNodeWithTree({
      treeOid,
      parents: [],
      message: 'malformed audit',
    });

    await expect(log.readEntry(sha)).rejects.toMatchObject({
      code: 'E_AUDIT_RECEIPT_TREE',
    });
  });

  it('preserves current receipt failures without probing legacy trees', async () => {
    const { auditCas, history, log } = createFixture();
    const corruption = Object.assign(new Error('manifest integrity failure'), {
      code: 'MANIFEST_INTEGRITY_ERROR',
    });
    auditCas.assets.adopt.mockRejectedValueOnce(corruption);
    const readTreeOids = vi.spyOn(history, 'readTreeOids');
    const sha = await history.commitNodeWithTree({
      treeOid: 'a'.repeat(40),
      parents: [],
      message: 'corrupt current audit',
    });

    await expect(log.readEntry(sha)).rejects.toBe(corruption);
    expect(readTreeOids).not.toHaveBeenCalled();
  });
});

function legacyTreeError(): Error & { readonly code: string } {
  return Object.assign(new Error('asset manifest not found'), {
    code: 'MANIFEST_NOT_FOUND',
  });
}
