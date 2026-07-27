import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import { REF_PREFIX } from '../../src/domain/utils/RefLayout.ts';
import { HookInstaller, type FsAdapter } from '../../src/domain/services/HookInstaller.ts';
import { usageError, notFoundError } from './infrastructure.ts';
import { GitStorage } from '../../storage.ts';
import {
  resolveWarpStorage,
  type WarpStorageBinding,
} from '../../src/application/WarpStorageRegistry.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type TrustChainPort from '../../src/ports/TrustChainPort.ts';
import type CryptoPort from '../../src/ports/CryptoPort.ts';
import type HookPathPort from '../../src/ports/HookPathPort.ts';

import type { Persistence, WarpGraphInstance, CliOptions } from './types.ts';

export type CliStorageBinding = {
  readonly persistence: Persistence;
  readonly runtimeStorage: RuntimeStorageProviderPort;
  readonly createTrustChain: (crypto: CryptoPort) => TrustChainPort;
  readonly hookPaths: HookPathPort;
};

const activeCliStorages = new Set<GitStorage>();

/** Releases every storage composition opened by the current CLI invocation. */
export async function closeCliStorages(): Promise<void> {
  const storages = [...activeCliStorages];
  activeCliStorages.clear();
  const results = await Promise.allSettled(storages.map(async (storage) => await storage.close()));
  const failures = results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason as unknown);
  if (failures.length > 0) {
    throw new AggregateError(failures, 'CLI storage failed to close cleanly');
  }
}

/**
 * Creates a persistence adapter for the given repository path.
 */
export async function createPersistence(repoPath: string): Promise<CliStorageBinding> {
  const storage = await GitStorage.open({ cwd: repoPath });
  try {
    const binding = requireCliStorageBinding(resolveWarpStorage(storage));
    activeCliStorages.add(storage);
    return binding;
  } catch (error) {
    try {
      await storage.close();
    } catch (closeError) {
      throw new AggregateError(
        [error, closeError],
        'CLI storage binding failed and local resources did not close cleanly',
      );
    }
    throw error;
  }
}

export function requireCliStorageBinding(
  binding: WarpStorageBinding,
): CliStorageBinding {
  if (!(binding.history instanceof GitTimelineHistoryAdapter)
    || binding.createTrustChain === undefined
    || binding.hookPaths === undefined) {
    throw usageError('GitStorage returned an incomplete CLI storage binding');
  }
  return {
    persistence: binding.history,
    runtimeStorage: binding.runtimeStorage,
    createTrustChain: binding.createTrustChain,
    hookPaths: binding.hookPaths,
  };
}

/**
 * Lists all graph names found under the WARP ref prefix.
 */
export async function listGraphNames(persistence: Persistence): Promise<string[]> {
  if (typeof persistence.listRefs !== 'function') {
    return [];
  }
  const refs = await persistence.listRefs(REF_PREFIX);
  const prefix = `${REF_PREFIX}/`;
  const names: Set<string> = new Set();

  for (const ref of refs) {
    if (!ref.startsWith(prefix)) {
      continue;
    }
    const rest = ref.slice(prefix.length);
    const [graphName] = rest.split('/');
    if (typeof graphName === 'string' && graphName.length > 0) {
      names.add(graphName);
    }
  }

  return ([...names].sort());
}

/**
 * Resolves the graph name from an explicit flag or auto-detects a single graph.
 */
export async function resolveGraphName(persistence: Persistence, explicitLane: string | null): Promise<string> {
  if (typeof explicitLane === 'string' && explicitLane.length > 0) {
    return explicitLane;
  }
  const graphNames = await listGraphNames(persistence);
  if (graphNames.length === 1) {
    return graphNames[0] as string;
  }
  if (graphNames.length === 0) {
    throw notFoundError('No Lanes found in repo; specify --lane');
  }
  throw usageError('Multiple Lanes found; specify --lane');
}

/**
 * Opens the substrate diagnostic host for the selected Lane.
 */
export async function openGraph(options: CliOptions): Promise<{ graph: WarpGraphInstance }> {
  const { persistence, runtimeStorage } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.lane);
  if (typeof options.lane === 'string' && options.lane.length > 0) {
    const graphNames = await listGraphNames(persistence);
    if (!graphNames.includes(options.lane)) {
      throw notFoundError(`Lane not found: ${options.lane}`);
    }
  }
  const graph = await openRuntimeHostProduct({
    persistence,
    runtimeStorage,
    graphName,
    writerId: options.writer,
    crypto: new WebCryptoAdapter(),
  });
  return { graph };
}

/**
 * Create a HookInstaller wired with real filesystem dependencies.
 */
export function createHookInstaller(hookPathPort: HookPathPort): HookInstaller {
  const packageRoot = findPackageRoot(fileURLToPath(new URL('.', import.meta.url)));
  const templateDir = path.join(packageRoot, 'scripts', 'hooks');
  const rawJson = fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
  const version = readPackageVersion(rawJson);
  return new HookInstaller({
    fs: fs as unknown as FsAdapter,
    hookPathPort,
    version,
    templateDir,
    path,
  });
}

/** Reads the package version from either source or built CLI layouts. */
export function readCliPackageVersion(): string {
  const packageRoot = findPackageRoot(fileURLToPath(new URL('.', import.meta.url)));
  const rawJson = fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
  return readPackageVersion(rawJson);
}

/**
 * Finds the repository/package root from either source or built CLI paths.
 */
function findPackageRoot(startDir: string): string {
  let current = startDir;
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      throw usageError('Unable to locate the git-warp package root');
    }
    current = parent;
  }
}

/**
 * Extracts the version string from raw package.json content.
 */
function readPackageVersion(rawJson: string): string {
  const raw: unknown = JSON.parse(rawJson);
  const obj = raw as { version: string };
  return obj.version;
}
