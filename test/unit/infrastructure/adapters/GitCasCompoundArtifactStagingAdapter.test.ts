import {
  BundleHandle as GitCasBundleHandle,
  PageHandle,
  type WorkspaceCompoundScope,
} from '@git-stunts/git-cas';
import { describe, expect, it, vi } from 'vitest';
import GitCasCompoundArtifactStagingAdapter
  from '../../../../src/infrastructure/adapters/GitCasCompoundArtifactStagingAdapter.ts';
import type { StagedBundleMember }
  from '../../../../src/ports/ArtifactStagingPort.ts';

const FIRST_PAGE = new PageHandle({ oid: '1'.repeat(40) });
const SECOND_PAGE = new PageHandle({ oid: '2'.repeat(40) });
const FIRST_BUNDLE = new GitCasBundleHandle({
  codec: 'ordered-test',
  oid: '3'.repeat(40),
});
const SECOND_BUNDLE = new GitCasBundleHandle({
  codec: 'ordered-test',
  oid: '4'.repeat(40),
});

describe('GitCasCompoundArtifactStagingAdapter', () => {
  it('maps single and batched staging onto the compound scope', async () => {
    const pageRequests: PageBatchRequest[] = [];
    const bundleRequests: BundleBatchRequest[] = [];
    const scope = compoundScope({
      putPages: async (request) => {
        pageRequests.push(request);
        return request.pages.length === 1
          ? Object.freeze([FIRST_PAGE])
          : Object.freeze([FIRST_PAGE, SECOND_PAGE]);
      },
      putBundles: async (request) => {
        bundleRequests.push(request);
        return request.bundles.length === 1
          ? Object.freeze([FIRST_BUNDLE])
          : Object.freeze([FIRST_BUNDLE, SECOND_BUNDLE]);
      },
    });
    const staging = new GitCasCompoundArtifactStagingAdapter({ scope });
    const first = new Uint8Array([1]);
    const second = new Uint8Array([2]);
    const members: StagedBundleMember[] = [['leaf/data', FIRST_PAGE.toString()]];

    await expect(staging.stagePage(first, { maxBytes: 1 }))
      .resolves.toBe(FIRST_PAGE.toString());
    const pages = await staging.stagePages!([first, second], {
      maxBytes: 1,
      maxBatchBytes: 2,
      maxBatchPages: 2,
    });
    const bundle = await staging.stageOrderedBundle(members, { maxMembers: 1 });
    const bundles = await staging.stageOrderedBundles!([
      { members },
      { members, options: { maxMembers: 1 } },
    ], {
      maxBatchBundles: 2,
      maxBatchMembers: 2,
      maxBatchObjects: 4,
      maxBatchBytes: 1024,
    });

    expect(pages).toEqual([FIRST_PAGE.toString(), SECOND_PAGE.toString()]);
    expect(Object.isFrozen(pages)).toBe(true);
    expect(bundle.toString()).toBe(FIRST_BUNDLE.toString());
    expect(bundles.map((bundle) => bundle.toString())).toEqual([
      FIRST_BUNDLE.toString(),
      SECOND_BUNDLE.toString(),
    ]);
    expect(Object.isFrozen(bundles)).toBe(true);
    expect(pageRequests).toEqual([
      { pages: [{ source: first, maxBytes: 1 }] },
      {
        pages: [
          { source: first, maxBytes: 1 },
          { source: second, maxBytes: 1 },
        ],
        maxBatchBytes: 2,
        maxBatchPages: 2,
      },
    ]);
    expect(bundleRequests).toEqual([
      { bundles: [{ members, limits: { maxMembers: 1 } }] },
      {
        bundles: [
          { members },
          { members, limits: { maxMembers: 1 } },
        ],
        maxBatchBundles: 2,
        maxBatchMembers: 2,
        maxBatchObjects: 4,
        maxBatchBytes: 1024,
      },
    ]);
  });

  it('fails closed when git-cas returns the wrong batch cardinality', async () => {
    const staging = new GitCasCompoundArtifactStagingAdapter({
      scope: compoundScope({
        putPages: async () => Object.freeze([FIRST_PAGE, SECOND_PAGE]),
        putBundles: async () => Object.freeze([]),
      }),
    });

    await expect(staging.stagePages!([new Uint8Array([1])], {
      maxBytes: 1,
      maxBatchBytes: 1,
      maxBatchPages: 1,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong provisional page count'),
    });
    await expect(staging.stageOrderedBundles!([{ members: [] }], {
      maxBatchBundles: 1,
      maxBatchMembers: 1,
      maxBatchObjects: 1,
      maxBatchBytes: 1,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('wrong provisional bundle count'),
    });
  });

  it('rejects a sparse single-handle response', async () => {
    const sparse = new Array<PageHandle>(1);
    const staging = new GitCasCompoundArtifactStagingAdapter({
      scope: compoundScope({
        putPages: async () => sparse,
        putBundles: async () => Object.freeze([FIRST_BUNDLE]),
      }),
    });

    await expect(staging.stagePage(new Uint8Array([1]), { maxBytes: 1 }))
      .rejects.toMatchObject({
        code: 'E_MATERIALIZATION_STORAGE',
        message: expect.stringContaining('omitted the staged page handle'),
      });
  });

  it('rejects sparse batched handle responses', async () => {
    const sparsePages = new Array<PageHandle>(2);
    sparsePages[0] = FIRST_PAGE;
    const sparseBundles = new Array<GitCasBundleHandle>(2);
    sparseBundles[0] = FIRST_BUNDLE;
    const staging = new GitCasCompoundArtifactStagingAdapter({
      scope: compoundScope({
        putPages: async () => sparsePages,
        putBundles: async () => sparseBundles,
      }),
    });

    await expect(staging.stagePages!([
      new Uint8Array([1]),
      new Uint8Array([2]),
    ], {
      maxBytes: 1,
      maxBatchBytes: 2,
      maxBatchPages: 2,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('omitted a provisional page handle'),
    });
    await expect(staging.stageOrderedBundles!([
      { members: [] },
      { members: [] },
    ], {
      maxBatchBundles: 2,
      maxBatchMembers: 2,
      maxBatchObjects: 2,
      maxBatchBytes: 2,
    })).rejects.toMatchObject({
      code: 'E_MATERIALIZATION_STORAGE',
      message: expect.stringContaining('omitted a provisional bundle handle'),
    });
  });
});

type PageBatchRequest = Parameters<WorkspaceCompoundScope['pages']['putBatch']>[0];
type BundleBatchRequest = Parameters<
  WorkspaceCompoundScope['bundles']['putOrderedBatch']
>[0];

function compoundScope(options: {
  readonly putPages: (
    request: PageBatchRequest,
  ) => ReturnType<WorkspaceCompoundScope['pages']['putBatch']>;
  readonly putBundles: (
    request: BundleBatchRequest,
  ) => ReturnType<WorkspaceCompoundScope['bundles']['putOrderedBatch']>;
}): WorkspaceCompoundScope {
  return Object.freeze({
    assets: Object.freeze({ putBatch: vi.fn() }),
    pages: Object.freeze({ putBatch: vi.fn(options.putPages) }),
    bundles: Object.freeze({ putOrderedBatch: vi.fn(options.putBundles) }),
  });
}
