import { describe, expect, it } from 'vitest';
import {
  findStorageOwnershipViolations,
  forbiddenCasManagementImplementations,
  forbiddenDomainStorageReferences,
  forbiddenPlumbingReflection,
  forbiddenRawGitObjectWrites,
  forbiddenRemovedReferences,
  forbiddenStorageModulePlacement,
} from '../../../scripts/check-storage-ownership.ts';

const REPO_ROOT = new URL('../../../', import.meta.url).pathname;

describe('storage ownership boundary', () => {
  it('rejects removed symbols in arbitrary identifier positions', () => {
    const path = `${REPO_ROOT}storage-ownership-fixture.ts`;
    const violations = forbiddenRemovedReferences(
      REPO_ROOT,
      path,
      `
      const CasSeekCacheAdapter = 1;
      function SeekCachePort() { return CasSeekCacheAdapter; }
      const active = SeekCachePort;
      export { active as CachedValue };
    `
    ).sort();

    expect(violations).toEqual([
      'storage-ownership-fixture.ts uses CachedValue',
      'storage-ownership-fixture.ts uses CasSeekCacheAdapter',
      'storage-ownership-fixture.ts uses SeekCachePort',
    ]);
  });

  it('rejects raw storage imports and capabilities in a mutation fixture', () => {
    const path = `${REPO_ROOT}domain-storage-boundary-fixture.ts`;
    const violations = forbiddenDomainStorageReferences(
      REPO_ROOT,
      path,
      `
      import type { AssetHandle } from '@git-stunts/git-cas';
      type Plumbing = import('@git-stunts/plumbing').default;
      interface LeakyPort {
        writeBlob(bytes: Uint8Array): Promise<string>;
        readTree(oid: string): Promise<object>;
      }
    `
    ).sort();

    expect(violations).toEqual([
      'domain-storage-boundary-fixture.ts exposes raw storage capability readTree',
      'domain-storage-boundary-fixture.ts exposes raw storage capability writeBlob',
      'domain-storage-boundary-fixture.ts imports forbidden storage module @git-stunts/git-cas',
      'domain-storage-boundary-fixture.ts imports forbidden storage module @git-stunts/plumbing',
    ]);
  });

  it('rejects storage dependencies outside the adapter composition root', () => {
    const path = `${REPO_ROOT}src/application/storage-leak-fixture.ts`;
    const violations = forbiddenStorageModulePlacement(
      REPO_ROOT,
      path,
      `
      import { PageHandle } from '@git-stunts/git-cas';
      const load = () => import('@git-stunts/plumbing');
    `
    ).sort();

    expect(violations).toEqual([
      'src/application/storage-leak-fixture.ts imports @git-stunts/git-cas outside the storage adapter composition root',
      'src/application/storage-leak-fixture.ts imports @git-stunts/plumbing outside the storage adapter composition root',
    ]);
  });

  it('rejects WARP-owned RootSet, cache-index, LRU, and page-cache implementations', () => {
    const path = `${REPO_ROOT}src/infrastructure/cache-fixture.ts`;
    const violations = forbiddenCasManagementImplementations(
      REPO_ROOT,
      path,
      `
      class RootSet {}
      class CacheIndex {}
      class PageCache {}
      const cacheIndex = new Map();
    `
    ).sort();

    expect(violations).toEqual([
      'src/infrastructure/cache-fixture.ts implements forbidden CAS/cache management CacheIndex',
      'src/infrastructure/cache-fixture.ts implements forbidden CAS/cache management PageCache',
      'src/infrastructure/cache-fixture.ts implements forbidden CAS/cache management RootSet',
      'src/infrastructure/cache-fixture.ts implements forbidden CAS/cache management cacheIndex',
    ]);
  });

  it('rejects raw Git object writers in an AST mutation fixture', () => {
    const path = `${REPO_ROOT}raw-git-writer-fixture.ts`;
    const violations = forbiddenRawGitObjectWrites(
      REPO_ROOT,
      path,
      `
      plumbing.execute({ args: ['hash-object', '-w', '--stdin'] });
      plumbing.execute({ args: [\`mktree\`] });
      plumbing.execute({ command: 'git write-tree --missing-ok' });
    `
    ).sort();

    expect(violations).toEqual([
      'raw-git-writer-fixture.ts invokes raw Git object writer hash-object',
      'raw-git-writer-fixture.ts invokes raw Git object writer mktree',
      'raw-git-writer-fixture.ts invokes raw Git object writer write-tree',
    ]);
  });

  it('rejects reflection over Git plumbing in a mutation fixture', () => {
    const path = `${REPO_ROOT}plumbing-reflection-fixture.ts`;
    const violations = forbiddenPlumbingReflection(
      REPO_ROOT,
      path,
      `
      const execute = Reflect.get(gitPlumbing, operation);
    `
    );

    expect(violations).toEqual(['plumbing-reflection-fixture.ts reflects over Git plumbing']);
  });

  it('keeps the production tree inside the no-CAS-management boundary', () => {
    expect(findStorageOwnershipViolations(REPO_ROOT)).toEqual([]);
  });
});
