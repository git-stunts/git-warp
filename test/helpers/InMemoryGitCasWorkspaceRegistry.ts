import {
  DEFAULT_WORKSPACE_COMPOUND_OPERATIONS,
  MAX_WORKSPACE_COMPOUND_OPERATIONS,
  RetentionWitness,
  StagedAsset,
  StagedBundle,
  StagedPage,
  type ApplicationHandle,
  type ApplicationHandleInput,
  type AssetCapability,
  type BundleCapability,
  type CacheStoreResult,
  type PageCapability,
  type WorkspaceCheckpointResult,
  type WorkspaceCompoundResult,
  type WorkspaceCompoundScope,
  type WorkspaceReleaseResult,
  type WorkspaceRetainedAsset,
  type WorkspaceRetainedBundle,
  type WorkspaceRetainedPage,
} from '@git-stunts/git-cas';
import type { GitCasStagingWorkspace }
  from '../../src/infrastructure/adapters/GitCasMaterializationWorkspace.ts';
import { parseInMemoryApplicationHandle } from './InMemoryGitCasApplicationHandle.ts';

type WorkspaceOpenOptions = Readonly<{
  namespace: string;
  ttlMs?: number;
}>;

/** Storage operations required by the in-memory workspace runtime. */
export interface InMemoryGitCasWorkspaceStorage {
  putAsset(request: Parameters<AssetCapability['put']>[0]): Promise<StagedAsset>;
  adoptAsset(treeOid: string): Promise<StagedAsset>;
  putPage(request: Parameters<PageCapability['put']>[0]): Promise<StagedPage>;
  putPageBatch(
    request: Parameters<PageCapability['putBatch']>[0],
  ): Promise<readonly StagedPage[]>;
  putBundle(
    members: Parameters<BundleCapability['putOrdered']>[0]['members'],
  ): Promise<StagedBundle>;
  putBundleBatch(
    request: Parameters<BundleCapability['putOrderedBatch']>[0],
  ): Promise<readonly StagedBundle[]>;
}

/** Owns in-memory git-cas workspace identities, roots, and compound admission. */
export default class InMemoryGitCasWorkspaceRegistry {
  readonly #storage: InMemoryGitCasWorkspaceStorage;
  readonly #workspaceRoots = new Map<string, ReadonlySet<string>>();
  #nextWorkspace = 1;
  #workspaceGeneration = 0;

  constructor(storage: InMemoryGitCasWorkspaceStorage) {
    this.#storage = storage;
    Object.freeze(this);
  }

  readActiveCount(): number {
    return this.#workspaceRoots.size;
  }

  readRoots(): readonly (readonly string[])[] {
    return Object.freeze(
      [...this.#workspaceRoots.values()].map((roots) => Object.freeze([...roots])),
    );
  }

  readGenerationCount(): number {
    return this.#workspaceGeneration;
  }

  async open(options: WorkspaceOpenOptions): Promise<GitCasStagingWorkspace> {
    const id = `test-workspace-${String(this.#nextWorkspace)}`;
    this.#nextWorkspace += 1;
    const ref = `refs/cas/workspaces/${options.namespace}/${id}`;
    const createdAt = new Date(0).toISOString();
    const expiresAt = new Date(options.ttlMs ?? 60_000).toISOString();
    let released = false;
    let roots = new Map<string, ApplicationHandle>();

    const install = (handles: Iterable<ApplicationHandleInput>): WorkspaceCheckpointResult => {
      if (released) {
        throw Object.assign(new Error('Workspace is released'), { code: 'WORKSPACE_RELEASED' });
      }
      roots = new Map(
        [...handles].map((input) => {
          const handle = parseInMemoryApplicationHandle(input);
          return [handle.toString(), handle];
        }),
      );
      this.#workspaceGeneration += 1;
      const generation = this.#workspaceGeneration.toString(16).padStart(40, '0');
      this.#workspaceRoots.set(ref, new Set(roots.keys()));
      const witnesses = [...roots.values()].map((handle, index) => new RetentionWitness({
        handle,
        policy: 'evictable',
        reachability: 'anchored',
        root: {
          kind: 'root-set',
          namespace: options.namespace,
          ref,
          generation,
          path: `root-${index.toString(16).padStart(8, '0')}`,
        },
        observedAt: createdAt,
      }));
      return Object.freeze({
        changed: true,
        ref,
        generation,
        expiresAt,
        handles: Object.freeze([...roots.values()]),
        witnesses: Object.freeze(witnesses),
      });
    };

    const retain = (handle: ApplicationHandle): RetentionWitness => {
      const checkpoint = install([...roots.values(), handle]);
      const witness = checkpoint.witnesses.find(
        (candidate) => candidate.handle.toString() === handle.toString(),
      );
      if (witness === undefined) {
        throw new Error('In-memory workspace omitted a staged handle');
      }
      return witness;
    };

    const release = async (): Promise<WorkspaceReleaseResult> => {
      const changed = !released;
      released = true;
      this.#workspaceRoots.delete(ref);
      return Object.freeze({
        changed,
        ref,
        generation: changed
          ? (++this.#workspaceGeneration).toString(16).padStart(40, '0')
          : null,
      });
    };

    const batch = async <T>(request: {
      readonly operation: (scope: WorkspaceCompoundScope) => T | Promise<T>;
      readonly maxOperations?: number;
      readonly retain?: (value: T) => readonly ApplicationHandleInput[];
    }): Promise<Readonly<WorkspaceCompoundResult<T>>> => {
      const maxOperations = request.maxOperations ?? DEFAULT_WORKSPACE_COMPOUND_OPERATIONS;
      if (
        !Number.isSafeInteger(maxOperations) ||
        maxOperations <= 0 ||
        maxOperations > MAX_WORKSPACE_COMPOUND_OPERATIONS
      ) {
        throw Object.assign(new Error('Invalid workspace compound operation bound'), {
          code: 'INVALID_OPTIONS',
        });
      }
      let operationCount = 0;
      const staged: ApplicationHandle[] = [];
      const countOperation = (): void => {
        operationCount += 1;
        if (operationCount > maxOperations) {
          throw Object.assign(new Error('Workspace compound operation bound exceeded'), {
            code: 'INVALID_OPTIONS',
          });
        }
      };
      const scope: WorkspaceCompoundScope = Object.freeze({
        assets: Object.freeze({
          putBatch: async (putRequest) => {
            countOperation();
            const assets: StagedAsset[] = [];
            for (const asset of putRequest.assets) {
              assets.push(await this.#storage.putAsset(asset));
            }
            const handles = assets.map((asset) => asset.handle);
            staged.push(...handles);
            return Object.freeze(handles);
          },
        }),
        pages: Object.freeze({
          putBatch: async (putRequest) => {
            countOperation();
            const pages = await this.#storage.putPageBatch(putRequest);
            const handles = pages.map((page) => page.handle);
            staged.push(...handles);
            return Object.freeze(handles);
          },
        }),
        bundles: Object.freeze({
          putOrderedBatch: async (putRequest) => {
            countOperation();
            const bundles = await this.#storage.putBundleBatch(putRequest);
            const handles = bundles.map((bundle) => bundle.handle);
            staged.push(...handles);
            return Object.freeze(handles);
          },
        }),
      });
      const value = await request.operation(scope);
      if (staged.length === 0) {
        throw Object.assign(new Error('Workspace compound admission staged no handles'), {
          code: 'INVALID_OPTIONS',
        });
      }
      const retained = request.retain === undefined
        ? staged
        : request.retain(value).map(parseInMemoryApplicationHandle);
      const stagedHandles = new Set(staged.map((handle) => handle.toString()));
      if (retained.some((handle) => !stagedHandles.has(handle.toString()))) {
        throw Object.assign(new Error('Workspace compound retained an unstaged handle'), {
          code: 'INVALID_OPTIONS',
        });
      }
      const retention = install([...roots.values(), ...retained]);
      return Object.freeze({ value, retention });
    };

    return Object.freeze({
      assets: Object.freeze({
        put: async (request): Promise<WorkspaceRetainedAsset> => {
          const staged = await this.#storage.putAsset(request);
          return retainedAsset(staged, retain(staged.handle));
        },
        putBatch: async (request): Promise<ReadonlyArray<WorkspaceRetainedAsset>> => {
          const staged: StagedAsset[] = [];
          for (const asset of request.assets) {
            staged.push(await this.#storage.putAsset(asset));
          }
          if (staged.length === 0) { return Object.freeze([]); }
          const checkpoint = install([
            ...roots.values(),
            ...staged.map((asset) => asset.handle),
          ]);
          const witnesses = new Map(checkpoint.witnesses.map((entry) => (
            [entry.handle.toString(), entry]
          )));
          return Object.freeze(staged.map((asset) => {
            const evidence = witnesses.get(asset.handle.toString());
            if (evidence === undefined) {
              throw new Error('In-memory workspace omitted a batched asset');
            }
            return retainedAsset(asset, evidence);
          }));
        },
        adopt: async ({ treeOid }): Promise<WorkspaceRetainedAsset> => {
          const staged = await this.#storage.adoptAsset(treeOid);
          return retainedAsset(staged, retain(staged.handle));
        },
      }),
      pages: Object.freeze({
        put: async (request): Promise<WorkspaceRetainedPage> => {
          const staged = await this.#storage.putPage(request);
          return retainedPage(staged, retain(staged.handle));
        },
        putBatch: async (request): Promise<ReadonlyArray<WorkspaceRetainedPage>> => {
          const staged = await this.#storage.putPageBatch(request);
          if (staged.length === 0) {
            return Object.freeze([]);
          }
          const checkpoint = install([
            ...roots.values(),
            ...staged.map((page) => page.handle),
          ]);
          const witnesses = new Map(checkpoint.witnesses.map((entry) => (
            [entry.handle.toString(), entry]
          )));
          return Object.freeze(staged.map((page) => {
            const evidence = witnesses.get(page.handle.toString());
            if (evidence === undefined) {
              throw new Error('In-memory workspace omitted a batched page');
            }
            return retainedPage(page, evidence);
          }));
        },
      }),
      bundles: Object.freeze({
        put: async (request): Promise<WorkspaceRetainedBundle> => {
          const staged = await this.#storage.putBundle(request.members);
          return retainedBundle(staged, retain(staged.handle));
        },
        putOrdered: async (request): Promise<WorkspaceRetainedBundle> => {
          const staged = await this.#storage.putBundle(request.members);
          return retainedBundle(staged, retain(staged.handle));
        },
        putOrderedBatch: async (request): Promise<ReadonlyArray<WorkspaceRetainedBundle>> => {
          const staged = await this.#storage.putBundleBatch(request);
          if (staged.length === 0) { return Object.freeze([]); }
          const checkpoint = install([
            ...roots.values(),
            ...staged.map((bundle) => bundle.handle),
          ]);
          const witnesses = new Map(checkpoint.witnesses.map((entry) => (
            [entry.handle.toString(), entry]
          )));
          return Object.freeze(staged.map((bundle) => {
            const evidence = witnesses.get(bundle.handle.toString());
            if (evidence === undefined) {
              throw new Error('In-memory workspace omitted a batched bundle');
            }
            return retainedBundle(bundle, evidence);
          }));
        },
      }),
      batch,
      checkpoint: async ({ handles }) => install(handles),
      promoteToCache: async ({ cache, key, handle, options: entryOptions }) => {
        const target = parseInMemoryApplicationHandle(handle);
        if (!roots.has(target.toString())) {
          install([...roots.values(), target]);
        }
        const destination: CacheStoreResult = await cache.put(key, target, entryOptions);
        return Object.freeze({ destination, release: await release() });
      },
      release,
    });
  }
}

function retainedAsset(
  staged: StagedAsset,
  witness: RetentionWitness,
): WorkspaceRetainedAsset {
  const retention = Object.freeze({
    policy: 'evictable',
    reachability: 'anchored',
    protection: 'workspace',
  });
  return Object.freeze({
    version: staged.version,
    state: 'retained',
    handle: staged.handle,
    asset: staged.asset,
    retention,
    witness,
    observedAt: staged.observedAt,
    toJSON: () => Object.freeze({
      ...staged.toJSON(),
      state: 'retained',
      retention,
      witness: witness.toJSON(),
    }),
  });
}

function retainedPage(
  staged: StagedPage,
  witness: RetentionWitness,
): WorkspaceRetainedPage {
  const retention = Object.freeze({
    policy: 'evictable',
    reachability: 'anchored',
    protection: 'workspace',
  });
  return Object.freeze({
    version: staged.version,
    state: 'retained',
    handle: staged.handle,
    page: staged.page,
    retention,
    witness,
    observedAt: staged.observedAt,
    toJSON: () => Object.freeze({
      ...staged.toJSON(),
      state: 'retained',
      retention,
      witness: witness.toJSON(),
    }),
  });
}

function retainedBundle(
  staged: StagedBundle,
  witness: RetentionWitness,
): WorkspaceRetainedBundle {
  const retention = Object.freeze({
    policy: 'evictable',
    reachability: 'anchored',
    protection: 'workspace',
  });
  return Object.freeze({
    version: staged.version,
    state: 'retained',
    handle: staged.handle,
    bundle: staged.bundle,
    limits: staged.limits,
    retention,
    witness,
    observedAt: staged.observedAt,
    toJSON: () => Object.freeze({
      ...staged.toJSON(),
      state: 'retained',
      retention,
      witness: witness.toJSON(),
    }),
  });
}
