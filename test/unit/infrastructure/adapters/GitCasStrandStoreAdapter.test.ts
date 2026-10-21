import { describe, expect, it, vi } from 'vitest';

import { buildStrandBraidRef, buildStrandRef, buildStrandWriterRef } from '../../../../src/domain/utils/RefLayout.ts';
import GitCasAssetStorageAdapter from '../../../../src/infrastructure/adapters/GitCasAssetStorageAdapter.ts';
import GitCasStrandStoreAdapter from '../../../../src/infrastructure/adapters/GitCasStrandStoreAdapter.ts';
import InMemoryBlobStorageAdapter from '../../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../../helpers/InMemoryGraphAdapter.ts';

const encoder = new TextEncoder();

/** Strand ids are 64-hex genesis hashes (#1014); names never reach the store. */
const DRAFT = 'd'.repeat(64);
const ALPHA = 'a'.repeat(64);
const ZETA = 'f'.repeat(64);
const RETIRED = 'e'.repeat(64);
const MISSING = '0'.repeat(64);
const TREE = 'b'.repeat(64);
const MALFORMED = 'c'.repeat(64);

function createFixture() {
  const history = new InMemoryGraphAdapter();
  const backing = new InMemoryBlobStorageAdapter();
  const cas = new InMemoryGitCasFacade({ history, storage: backing });
  const assets = new GitCasAssetStorageAdapter({ cas });
  const strands = new GitCasStrandStoreAdapter({
    history,
    cas,
    assets,
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
      strandId: DRAFT,
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
    await expect(strands.readDescriptor('events', DRAFT))
      .resolves.toEqual(encoder.encode('{"version":1}'));
  });

  it('lists, probes, and deletes only direct strand descriptors', async () => {
    const { history, strands } = createFixture();
    const alpha = await strands.publishDescriptor({
      graphName: 'events',
      strandId: ALPHA,
      descriptor: encoder.encode('alpha'),
      attachments: [],
    });
    await strands.publishDescriptor({
      graphName: 'events',
      strandId: ZETA,
      descriptor: encoder.encode('zeta'),
      attachments: [],
    });
    await history.updateRef(buildStrandBraidRef('events', ALPHA, { braidedStrandId: ZETA, writerId: 'alice' }), alpha.revision);
    await history.updateRef(buildStrandWriterRef('events', ALPHA, 'alice'), alpha.revision);

    expect(await strands.listStrandIds('events')).toEqual([ALPHA, ZETA]);
    expect(await strands.hasDescriptor('events', ALPHA)).toBe(true);
    expect(await strands.deleteDescriptor('events', ALPHA)).toBe(true);
    expect(await strands.deleteDescriptor('events', ALPHA)).toBe(false);
    expect(await strands.hasDescriptor('events', ALPHA)).toBe(false);
  });

  it('rejects descriptor refs that point directly to blobs', async () => {
    const { history, strands } = createFixture();
    const readObjectType = vi.spyOn(history, 'readObjectType');
    const readBlob = vi.spyOn(history, 'readBlob');
    const blob = await history.writeBlob(encoder.encode('retired descriptor'));
    await history.updateRef(buildStrandRef('events', RETIRED), blob);

    await expect(strands.readDescriptor('events', RETIRED))
      .rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });
    expect(readBlob).not.toHaveBeenCalled();
    expect(readObjectType).toHaveBeenCalledWith(blob);
    await expect(strands.readDescriptor('events', MISSING)).resolves.toBeNull();
  });

  it('does not delete a descriptor concurrently replaced after the read', async () => {
    const { history, strands } = createFixture();
    await strands.publishDescriptor({
      graphName: 'events',
      strandId: DRAFT,
      descriptor: encoder.encode('draft'),
      attachments: [],
    });
    const ref = buildStrandRef('events', DRAFT);
    const replacement = 'd'.repeat(40);
    const compareAndDelete = history.compareAndDeleteRef.bind(history);
    vi.spyOn(history, 'compareAndDeleteRef').mockImplementationOnce(async (target, expected) => {
      await history.updateRef(target, replacement);
      return await compareAndDelete(target, expected);
    });

    await expect(strands.deleteDescriptor('events', DRAFT)).resolves.toBe(false);
    await expect(history.readRef(ref)).resolves.toBe(replacement);
  });

  it('refuses to publish over a non-commit descriptor head', async () => {
    const { history, strands } = createFixture();
    const blob = await history.writeBlob(encoder.encode('retired descriptor'));
    await history.updateRef(buildStrandRef('events', RETIRED), blob);

    await expect(strands.publishDescriptor({
      graphName: 'events',
      strandId: RETIRED,
      descriptor: encoder.encode('current descriptor'),
      attachments: [],
    })).rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });
  });

  it('rejects descriptor refs targeting unsupported object types', async () => {
    const { history, strands } = createFixture();
    await history.updateRef(buildStrandRef('events', TREE), history.emptyTree);

    await expect(strands.readDescriptor('events', TREE))
      .rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });
  });

  it('rejects publication identity mismatches and missing descriptor trailers', async () => {
    const { history, strands } = createFixture();
    const mismatched = await commitDescriptorMessage(history, [
      'warp:strand-descriptor',
      '',
      'eg-graph: other',
      `eg-strand: ${DRAFT}`,
      'eg-strand-descriptor-handle: unused',
    ].join('\n'));
    await history.updateRef(buildStrandRef('events', DRAFT), mismatched);

    await expect(strands.readDescriptor('events', DRAFT))
      .rejects.toMatchObject({ code: 'E_STRAND_CORRUPT' });

    const malformed = await commitDescriptorMessage(history, 'warp:strand-descriptor');
    await history.updateRef(buildStrandRef('events', MALFORMED), malformed);
    await expect(strands.readDescriptor('events', MALFORMED))
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
