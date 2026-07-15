import { describe, expect, it, vi } from 'vitest';

import { buildStrandRef } from '../../../../src/domain/utils/RefLayout.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasStrandStoreAdapter from '../../../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';
import {
  V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
} from '../../../../scripts/migrations/v17.0.0/SubstrateMigrationCompatibilityPolicy.ts';

const encoder = new TextEncoder();

function createFixture(options: { readonly compatibility?: boolean } = {}) {
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const assets = new GitCasAssetStorageAdapter({ cas, legacyReader: history });
  const strands = new GitCasStrandStoreAdapter({
    history,
    cas,
    assets,
    ...(options.compatibility === true
      ? { compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY }
      : {}),
  });
  return { assets, backing, cas, history, strands };
}

describe('GitCasStrandStoreAdapter', () => {
  it('publishes descriptor bundles with attachments and retention evidence', async () => {
    const { assets, cas, strands } = createFixture();
    const attachment = await assets.stage(singleChunk(encoder.encode('attachment')), {
      slug: 'attachment',
    });
    const published = await strands.publishDescriptor({
      graphName: 'events',
      strandId: 'draft',
      descriptor: encoder.encode('{"version":1}'),
      attachments: [attachment.handle, attachment.handle],
    });

    expect(published.retention).toMatchObject({
      policy: 'pinned',
      reachability: 'anchored',
      root: { kind: 'publication', generation: published.revision },
    });
    expect(cas.readBundleMembers(published.bundleHandle.toString())).toEqual([
      ['descriptor', published.descriptorAsset.handle.toString()],
      ['attachments/00000000', attachment.handle.toString()],
    ]);
    await expect(strands.readDescriptor('events', 'draft'))
      .resolves.toEqual(encoder.encode('{"version":1}'));
  });

  it('lists, probes, and deletes only direct strand descriptors', async () => {
    const { history, strands } = createFixture();
    const alpha = await strands.publishDescriptor({
      graphName: 'events',
      strandId: 'alpha',
      descriptor: encoder.encode('alpha'),
      attachments: [],
    });
    await strands.publishDescriptor({
      graphName: 'events',
      strandId: 'zeta',
      descriptor: encoder.encode('zeta'),
      attachments: [],
    });
    await history.updateRef('refs/warp/events/strands/alpha/braids/other', alpha.revision);

    expect(await strands.listStrandIds('events')).toEqual(['alpha', 'zeta']);
    expect(await strands.hasDescriptor('events', 'alpha')).toBe(true);
    expect(await strands.deleteDescriptor('events', 'alpha')).toBe(true);
    expect(await strands.deleteDescriptor('events', 'alpha')).toBe(false);
    expect(await strands.hasDescriptor('events', 'alpha')).toBe(false);
  });

  it('reads legacy refs that point directly to descriptor blobs', async () => {
    const { assets, cas, history, strands } = createFixture();
    const readObjectType = vi.spyOn(history, 'readObjectType');
    const readBlob = vi.spyOn(history, 'readBlob');
    const bytes = encoder.encode('legacy descriptor');
    const blob = await history.writeBlob(bytes);
    await history.updateRef(buildStrandRef('events', 'legacy'), blob);

    await expect(strands.readDescriptor('events', 'legacy'))
      .rejects.toMatchObject({ code: 'E_LEGACY_SUBSTRATE_DISABLED' });
    expect(readBlob).not.toHaveBeenCalled();

    const compatible = new GitCasStrandStoreAdapter({
      history,
      cas,
      assets,
      compatibilityPolicy: V17_SUBSTRATE_MIGRATION_COMPATIBILITY_POLICY,
    });
    await expect(compatible.readDescriptor('events', 'legacy')).resolves.toEqual(bytes);
    expect(readObjectType).toHaveBeenCalledWith(blob);
    await expect(strands.readDescriptor('events', 'missing')).resolves.toBeNull();
  });

  it('does not delete a descriptor concurrently replaced after the read', async () => {
    const { history, strands } = createFixture();
    await strands.publishDescriptor({
      graphName: 'events',
      strandId: 'draft',
      descriptor: encoder.encode('draft'),
      attachments: [],
    });
    const ref = buildStrandRef('events', 'draft');
    const replacement = 'd'.repeat(40);
    const compareAndDelete = history.compareAndDeleteRef.bind(history);
    vi.spyOn(history, 'compareAndDeleteRef').mockImplementationOnce(async (target, expected) => {
      await history.updateRef(target, replacement);
      return await compareAndDelete(target, expected);
    });

    await expect(strands.deleteDescriptor('events', 'draft')).resolves.toBe(false);
    await expect(history.readRef(ref)).resolves.toBe(replacement);
  });

  it('replaces a legacy blob ref without treating the blob as a commit parent', async () => {
    const { history, strands } = createFixture();
    const blob = await history.writeBlob(encoder.encode('legacy descriptor'));
    await history.updateRef(buildStrandRef('events', 'legacy'), blob);

    const published = await strands.publishDescriptor({
      graphName: 'events',
      strandId: 'legacy',
      descriptor: encoder.encode('current descriptor'),
      attachments: [],
    });

    await expect(history.getNodeInfo(published.revision)).resolves.toMatchObject({
      parents: [],
    });
  });

  it('rejects descriptor refs targeting unsupported object types', async () => {
    const { history, strands } = createFixture();
    await history.updateRef(buildStrandRef('events', 'tree'), history.emptyTree);

    await expect(strands.readDescriptor('events', 'tree'))
      .rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });
  });

  it('rejects publication identity mismatches and missing descriptor trailers', async () => {
    const { history, strands } = createFixture();
    const mismatched = await commitDescriptorMessage(history, [
      'warp:strand-descriptor',
      '',
      'eg-graph: other',
      'eg-strand: draft',
      'eg-strand-descriptor-handle: unused',
    ].join('\n'));
    await history.updateRef(buildStrandRef('events', 'draft'), mismatched);

    await expect(strands.readDescriptor('events', 'draft'))
      .rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });

    const malformed = await commitDescriptorMessage(history, 'warp:strand-descriptor');
    await history.updateRef(buildStrandRef('events', 'malformed'), malformed);
    await expect(strands.readDescriptor('events', 'malformed'))
      .rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });
  });
});

async function commitDescriptorMessage(
  history: InMemoryGraphAdapter,
  message: string,
): Promise<string> {
  return await history.commitNodeWithTree({
    treeOid: history.emptyTree,
    parents: [],
    message,
  });
}

async function* singleChunk(bytes: Uint8Array): AsyncGenerator<Uint8Array> {
  yield bytes;
}
