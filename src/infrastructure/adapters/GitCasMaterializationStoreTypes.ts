import type {
  AssetCapability,
  BundleCapability,
  CacheSet,
  PageCapability,
} from '@git-stunts/git-cas';
import type {
  GitCasStagingWorkspace,
} from './GitCasMaterializationWorkspace.ts';

export type MaterializationCacheSet = Pick<
  CacheSet,
  'acquire' | 'inspect' | 'put' | 'remove' | 'ref'
>;

export type MaterializationCachePut = Awaited<
  ReturnType<MaterializationCacheSet['put']>
>;

export type GitCasMaterializationFacade = {
  readonly assets: Pick<AssetCapability, 'open'>;
  readonly bundles: Pick<
    BundleCapability,
    'getMemberReference' | 'iterateMemberReferences'
  >;
  readonly caches: {
    open(options: { readonly namespace: string }): Promise<MaterializationCacheSet>;
  };
  readonly pages: Pick<PageCapability, 'get' | 'put'>;
  readonly workspaces: {
    open(options: {
      readonly namespace: string;
      readonly ttlMs?: number;
    }): Promise<GitCasStagingWorkspace>;
  };
};
