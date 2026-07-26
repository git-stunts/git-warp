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
  const assets = new GitCasAssetStorageAdapter({ cas });
  const auditCas = {
    assets: {
      put: vi.fn(cas.assets.put),
      adopt: vi.fn(cas.assets.adopt),
      open: vi.fn(cas.assets.open),
    },
    publications: cas.publications,
  };
  const log = new GitCasAuditLogAdapter({
    history,
    cas: auditCas,
    assets,
  });
  return { assets, auditCas, backing, cas, history, log };
}

describe('GitCasAuditLogAdapter', () => {
  it('publishes, lists, and reads causally retained audit receipts', async () => {
    const { auditCas, log } = createFixture();
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
    expect(auditCas.assets.open).not.toHaveBeenCalled();
  });

  it('preserves missing asset manifests without probing Git trees', async () => {
    const { auditCas, history, log } = createFixture();
    const missingManifest = Object.assign(new Error('asset manifest not found'), {
      code: 'MANIFEST_NOT_FOUND',
    });
    auditCas.assets.adopt.mockRejectedValueOnce(missingManifest);
    const readTreeOids = vi.spyOn(history, 'readTreeOids');
    const sha = await history.commitNodeWithTree({
      treeOid: 'a'.repeat(40),
      parents: [],
      message: 'missing current audit asset',
    });

    await expect(log.readEntry(sha)).rejects.toBe(missingManifest);
    expect(readTreeOids).not.toHaveBeenCalled();
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

  it('maps provider publication conflicts to the audit boundary error', async () => {
    const { assets, auditCas, history } = createFixture();
    const log = new GitCasAuditLogAdapter({
      history,
      assets,
      cas: {
        assets: auditCas.assets,
        publications: {
          commit: vi.fn().mockRejectedValue(Object.assign(
            new Error('publication conflict'),
            {
              code: 'PUBLICATION_CONFLICT',
              meta: { observed: 'f'.repeat(40) },
            },
          )),
        },
      },
    });

    await expect(log.append({
      graphName: 'events',
      writerId: 'alice',
      expectedHead: 'a'.repeat(40),
      parent: 'a'.repeat(40),
      message: 'audit alice',
      receipt: encoder.encode('alice receipt'),
    })).rejects.toMatchObject({
      code: 'E_AUDIT_PUBLICATION_CONFLICT',
      expectedHead: 'a'.repeat(40),
      observedHead: 'f'.repeat(40),
    });
  });

  it.each([
    Object.assign(new Error('missing metadata'), { code: 'PUBLICATION_CONFLICT' }),
    Object.assign(new Error('null metadata'), { code: 'PUBLICATION_CONFLICT', meta: null }),
    Object.assign(new Error('missing observation'), { code: 'PUBLICATION_CONFLICT', meta: {} }),
    Object.assign(new Error('invalid observation'), { code: 'PUBLICATION_CONFLICT', meta: { observed: 42 } }),
  ])('maps a provider conflict without a usable observed head', async (conflict) => {
    const { assets, auditCas, history } = createFixture();
    const log = new GitCasAuditLogAdapter({
      history,
      assets,
      cas: {
        assets: auditCas.assets,
        publications: { commit: vi.fn().mockRejectedValue(conflict) },
      },
    });

    await expect(log.append({
      graphName: 'events',
      writerId: 'alice',
      expectedHead: null,
      parent: null,
      message: 'audit alice',
      receipt: encoder.encode('alice receipt'),
    })).rejects.toMatchObject({
      code: 'E_AUDIT_PUBLICATION_CONFLICT',
      expectedHead: null,
      observedHead: null,
    });
  });

  it('preserves non-conflict publication failures', async () => {
    const { assets, auditCas, history } = createFixture();
    const failure = new Error('publication storage unavailable');
    const log = new GitCasAuditLogAdapter({
      history,
      assets,
      cas: {
        assets: auditCas.assets,
        publications: { commit: vi.fn().mockRejectedValue(failure) },
      },
    });

    await expect(log.append({
      graphName: 'events',
      writerId: 'alice',
      expectedHead: null,
      parent: null,
      message: 'audit alice',
      receipt: encoder.encode('alice receipt'),
    })).rejects.toBe(failure);
  });
});
