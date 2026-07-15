import { describe, expect, it } from 'vitest';
import { AssetHandle as GitCasAssetHandle } from '@git-stunts/git-cas';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import PatchPublicationConflictError from '../../../../src/domain/errors/PatchPublicationConflictError.ts';
import SyncError from '../../../../src/domain/errors/SyncError.ts';
import AssetHandle from '../../../../src/domain/storage/AssetHandle.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';
import { CborPatchJournalAdapter } from '../../../../src/infrastructure/adapters/CborPatchJournalAdapter.ts';
import {
  DEFAULT_COMMIT_MESSAGE_CODEC,
} from '../../../../src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.ts';
import { CborCodec } from '../../../../src/infrastructure/codecs/CborCodec.ts';
import {
  LEGACY_GIT_BLOB_PATCH_STORAGE,
} from '../../../../src/ports/CommitMessageCodecPort.ts';
import PatchJournalPort from '../../../../src/ports/PatchJournalPort.ts';
import {
  V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
} from '../../../../scripts/migrations/v17.0.0/SubstrateMigrationCompatibilityPolicy.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const TARGET_REF = 'refs/warp/test/writers/alice';

function createFixture(options: { compatibility?: boolean } = {}) {
  const history = new InMemoryGraphAdapter();
  const assets = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: assets });
  const journal = new CborPatchJournalAdapter({
    assetStorage: assets,
    cas,
    codec: new CborCodec(),
    commitReader: history,
    commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    ...(options.compatibility === true
      ? { compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY }
      : {}),
  });
  return { history, assets, cas, journal };
}

function createPatch(lamport: number, nodeId: string): Patch {
  return new Patch({
    schema: 3,
    writer: 'alice',
    lamport,
    context: { alice: lamport - 1 },
    ops: [new NodeAdd(nodeId, new Dot('alice', lamport))],
    reads: [],
    writes: [nodeId],
  });
}

describe('CborPatchJournalAdapter semantic publication', () => {
  it('is a PatchJournalPort and rejects missing semantic dependencies', () => {
    const { journal, assets, cas, history } = createFixture();
    expect(journal).toBeInstanceOf(PatchJournalPort);

    // @ts-expect-error Runtime guard for JavaScript callers.
    expect(() => new CborPatchJournalAdapter({ cas, codec: new CborCodec(), commitReader: history }))
      .toThrow(/assetStorage/);
    // @ts-expect-error Runtime guard for JavaScript callers.
    expect(() => new CborPatchJournalAdapter({ assetStorage: assets, codec: new CborCodec(), commitReader: history }))
      .toThrow(/cas/);
    // @ts-expect-error Runtime guard for JavaScript callers.
    expect(() => new CborPatchJournalAdapter({ assetStorage: assets, cas, commitReader: history }))
      .toThrow(/codec/);
  });

  it('streams a patch, bundles every attachment, and publishes retention evidence', async () => {
    const { history, assets, cas, journal } = createFixture();
    const attachment = await assets.store('attachment');
    const patch = createPatch(1, 'node:a');

    const published = await journal.appendPatch({
      patch,
      graph: 'test',
      writer: 'alice',
      targetRef: TARGET_REF,
      expectedHead: null,
      parent: null,
      attachments: [attachment, attachment],
    });

    expect(await history.readRef(TARGET_REF)).toBe(published.sha);
    expect(published.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: { kind: 'publication', locator: TARGET_REF, generation: published.sha },
    });
    expect(cas.readPublicationRoot(published.sha)).toBe(published.bundleHandle.toString());
    expect(cas.readBundleMembers(published.bundleHandle.toString())).toEqual([
      ['attachments/00000000', attachment.toString()],
      ['patch', published.stagedPatch.handle.toString()],
    ]);
  });

  it('round-trips runtime patch classes through the published commit locator', async () => {
    const { history, journal } = createFixture();
    const original = createPatch(1, 'node:a');
    const published = await journal.appendPatch({
      patch: original,
      graph: 'test',
      writer: 'alice',
      targetRef: TARGET_REF,
      expectedHead: null,
      parent: null,
      attachments: [],
    });
    const commit = await history.getNodeInfo(published.sha);
    const loaded = await journal.readPatch(DEFAULT_COMMIT_MESSAGE_CODEC.decodePatch(commit.message));

    expect(loaded.writer).toBe('alice');
    expect(loaded.lamport).toBe(1);
    expect(loaded.ops[0]).toBeInstanceOf(NodeAdd);
    expect((loaded.ops[0] as NodeAdd).node).toBe('node:a');
  });

  it('maps provider publication conflicts to a typed domain error', async () => {
    const { history, assets, cas } = createFixture();
    const providerFailure = Object.assign(new Error('conflict'), {
      code: 'PUBLICATION_CONFLICT',
    });
    const journal = new CborPatchJournalAdapter({
      assetStorage: assets,
      cas: {
        bundles: cas.bundles,
        publications: { commit: () => Promise.reject(providerFailure) },
      },
      codec: new CborCodec(),
      commitReader: history,
      commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC,
    });

    await expect(journal.appendPatch({
      patch: createPatch(1, 'node:a'),
      graph: 'test',
      writer: 'alice',
      targetRef: TARGET_REF,
      expectedHead: null,
      parent: null,
      attachments: [],
    })).rejects.toMatchObject({
      code: PatchPublicationConflictError.CODE,
      cause: providerFailure,
    });
  });

  it('scans a causal patch range in chronological order and detects divergence', async () => {
    const { history, journal } = createFixture();
    const first = await journal.appendPatch({
      patch: createPatch(1, 'node:a'),
      graph: 'test',
      writer: 'alice',
      targetRef: TARGET_REF,
      expectedHead: null,
      parent: null,
      attachments: [],
    });
    const second = await journal.appendPatch({
      patch: createPatch(2, 'node:b'),
      graph: 'test',
      writer: 'alice',
      targetRef: TARGET_REF,
      expectedHead: first.sha,
      parent: first.sha,
      attachments: [],
    });

    const entries = await journal.scanPatchRange('alice', null, second.sha).collect();
    expect(entries.map((entry) => entry.sha)).toEqual([first.sha, second.sha]);
    expect(entries.map((entry) => entry.patch.lamport)).toEqual([1, 2]);
    await expect(journal.scanPatchRange('alice', 'f'.repeat(40), second.sha).collect())
      .rejects.toBeInstanceOf(SyncError);

    const nonPatch = await history.commitNode({
      message: 'not a patch publication',
      parents: [first.sha],
    });
    await expect(journal.scanPatchRange('alice', first.sha, nonPatch).collect())
      .rejects.toBeInstanceOf(SyncError);
  });

  it('fails closed for legacy patch storage unless compatibility is explicit', async () => {
    const current = createFixture();
    const compatible = createFixture({ compatibility: true });
    const patch = createPatch(1, 'node:a');
    const stagedHandle = await compatible.assets.store(new CborCodec().encode(patch));
    const handle = new AssetHandle(GitCasAssetHandle.parse(stagedHandle.toString()).oid);
    const message = DEFAULT_COMMIT_MESSAGE_CODEC.decodePatch(
      DEFAULT_COMMIT_MESSAGE_CODEC.encodePatch({
        kind: 'patch',
        graph: 'test',
        writer: 'alice',
        lamport: 1,
        patchHandle: handle,
        schema: 3,
        storage: LEGACY_GIT_BLOB_PATCH_STORAGE,
      }),
    );

    await expect(current.journal.readPatch(message)).rejects.toThrow(/Legacy patch storage reads/);
    await expect(compatible.journal.readPatch(message)).resolves.toMatchObject({
      writer: 'alice',
      lamport: 1,
    });
  });
});
