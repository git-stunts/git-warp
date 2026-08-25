import type { BundleCapability } from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';
import InMemoryBlobStorageAdapter from '../../helpers/InMemoryBlobStorageAdapter.ts';
import InMemoryGitCasFacade from '../../helpers/InMemoryGitCasFacade.ts';
import InMemoryGraphAdapter from '../../helpers/InMemoryGraphAdapter.ts';

describe('InMemoryGitCasFacade page handles', () => {
  it.each([
    ['sha1', 40],
    ['sha256', 64],
  ])('derives %s metadata from the history OID width', async (hashAlgorithm, oidLength) => {
    const oid = 'a'.repeat(oidLength);
    const cas = new InMemoryGitCasFacade({
      history: new InMemoryGraphAdapter({ hash: () => oid }),
      storage: new InMemoryBlobStorageAdapter(),
    });

    const page = await cas.pages.put({ source: new Uint8Array([1]) });

    expect(page.handle.oid).toBe(oid);
    expect(page.handle.hashAlgorithm).toBe(hashAlgorithm);
  });
});

describe('InMemoryGitCasFacade bundle batches', () => {
  it.each(bundleLimitCases())('$name before staging', async ({ request, code, meta }) => {
    const history = new InMemoryGraphAdapter();
    const writeBlob = vi.spyOn(history, 'writeBlob');
    const writeTree = vi.spyOn(history, 'writeTree');
    const cas = new InMemoryGitCasFacade({
      history,
      storage: new InMemoryBlobStorageAdapter(),
    });

    await expect(cas.bundles.putOrderedBatch(request)).rejects.toMatchObject({ code, meta });
    expect(writeBlob).not.toHaveBeenCalled();
    expect(writeTree).not.toHaveBeenCalled();
  });

  it('preserves frozen ordered results for valid bounded batches', async () => {
    const history = new InMemoryGraphAdapter();
    const cas = new InMemoryGitCasFacade({
      history,
      storage: new InMemoryBlobStorageAdapter(),
    });

    const staged = await cas.bundles.putOrderedBatch({
      bundles: [
        { members: bundleMembers(1), limits: { maxMembers: 1 } },
        { members: bundleMembers(1, 'second'), limits: { maxMembers: 1 } },
      ],
      maxBatchBundles: 2,
      maxBatchMembers: 2,
      maxBatchObjects: 8,
      maxBatchBytes: 1024,
    });

    expect(Object.isFrozen(staged)).toBe(true);
    expect(staged.map((bundle) => bundle.bundle.memberCount)).toEqual([1, 1]);
    expect(staged.map((bundle) => bundle.limits.maxMembers)).toEqual([1, 1]);
  });
});

type BundleBatchRequest = Parameters<BundleCapability['putOrderedBatch']>[0];

type BundleLimitCase = Readonly<{
  name: string;
  request: BundleBatchRequest;
  code: string;
  meta: Readonly<Record<string, string | number>>;
}>;

function bundleLimitCases(): readonly BundleLimitCase[] {
  return Object.freeze([
    {
      name: 'rejects a per-bundle member overrun',
      request: { bundles: [{ members: bundleMembers(2), limits: { maxMembers: 1 } }] },
      code: 'BUNDLE_MEMBER_LIMIT',
      meta: { observedMembers: 2, maxMembers: 1 },
    },
    {
      name: 'rejects a per-bundle path-byte overrun',
      request: {
        bundles: [{
          members: [['long', 'test:member']],
          limits: { maxMemberPathBytes: 1 },
        }],
      },
      code: 'BUNDLE_PATH_LIMIT',
      meta: { pathBytes: 4, maxMemberPathBytes: 1 },
    },
    {
      name: 'rejects a per-bundle descriptor-byte overrun',
      request: {
        bundles: [{
          members: [['member', 'test:member']],
          limits: { maxDescriptorBytes: 1 },
        }],
      },
      code: 'BUNDLE_DESCRIPTOR_LIMIT',
      meta: { maxDescriptorBytes: 1 },
    },
    {
      name: 'rejects a per-bundle fanout-depth overrun',
      request: {
        bundles: [{
          members: bundleMembers(3),
          limits: { maxFanoutEntries: 3, maxFanoutDepth: 1 },
        }],
      },
      code: 'BUNDLE_FANOUT_LIMIT',
      meta: { attemptedDepth: 2, maxFanoutDepth: 1 },
    },
    {
      name: 'rejects an invalid per-bundle limit',
      request: { bundles: [{ members: [], limits: { maxMembers: -1 } }] },
      code: 'BUNDLE_LIMIT_INVALID',
      meta: { field: 'maxMembers', value: -1, min: 0, max: 100_000 },
    },
    {
      name: 'rejects a bundle-count overrun',
      request: {
        bundles: [{ members: [] }, { members: [] }],
        maxBatchBundles: 1,
      },
      code: 'INVALID_OPTIONS',
      meta: { observedBundles: 2, maxBatchBundles: 1 },
    },
    {
      name: 'rejects an aggregate member overrun',
      request: {
        bundles: [{ members: bundleMembers(1) }, { members: bundleMembers(1, 'second') }],
        maxBatchMembers: 1,
      },
      code: 'BUNDLE_MEMBER_LIMIT',
      meta: { observedMembers: 2, maxBatchMembers: 1 },
    },
    {
      name: 'rejects a planned object overrun',
      request: {
        bundles: [{ members: [] }, { members: [] }],
        maxBatchObjects: 7,
      },
      code: 'INVALID_OPTIONS',
      meta: { observedObjects: 8, maxBatchObjects: 7 },
    },
    {
      name: 'rejects a planned byte overrun',
      request: { bundles: [{ members: [] }], maxBatchBytes: 1 },
      code: 'INVALID_OPTIONS',
      meta: { kind: 'bytes', maximum: 1 },
    },
    {
      name: 'rejects an invalid batch limit',
      request: { bundles: [], maxBatchBundles: 0 },
      code: 'INVALID_OPTIONS',
      meta: { label: 'bundle count', value: 0, maximum: 256 },
    },
  ]);
}

function bundleMembers(count: number, prefix = 'member'): Array<[string, string]> {
  return Array.from({ length: count }, (_, index) => [
    `${prefix}-${String(index)}`,
    `test:${prefix}-${String(index)}`,
  ]);
}
