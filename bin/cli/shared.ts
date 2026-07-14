import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { textEncode } from '../../src/domain/utils/bytes.ts';
import GitTimelineHistoryAdapter from '../../src/infrastructure/adapters/GitTimelineHistoryAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import { openRuntimeHostProduct } from '../../src/domain/warp/RuntimeHostProduct.ts';
import {
  REF_PREFIX,
  buildCursorActiveRef,
} from '../../src/domain/utils/RefLayout.ts';
import { HookInstaller, type FsAdapter } from '../../src/domain/services/HookInstaller.ts';
import { parseCursorBlob } from '../../src/domain/utils/parseCursorBlob.ts';
import { usageError, notFoundError } from './infrastructure.ts';
import { GitStorage } from '../../storage.ts';
import { resolveWarpStorage } from '../../src/application/WarpStorageRegistry.ts';
import type RuntimeStorageProviderPort from '../../src/ports/RuntimeStorageProviderPort.ts';
import type SeekCachePort from '../../src/ports/SeekCachePort.ts';
import type TrustChainPort from '../../src/ports/TrustChainPort.ts';
import type CryptoPort from '../../src/ports/CryptoPort.ts';
import type HookPathPort from '../../src/ports/HookPathPort.ts';

import type { Persistence, WarpGraphInstance, CursorBlob, CliOptions, SeekSpec } from './types.ts';

export type CliStorageBinding = {
  readonly persistence: Persistence;
  readonly runtimeStorage: RuntimeStorageProviderPort;
  readonly createSeekCache: (timelineName: string) => SeekCachePort;
  readonly createTrustChain: (crypto: CryptoPort) => TrustChainPort;
  readonly hookPaths: HookPathPort;
};

/**
 * Creates a persistence adapter for the given repository path.
 */
export async function createPersistence(repoPath: string): Promise<CliStorageBinding> {
  const storage = await GitStorage.open({ cwd: repoPath });
  const binding = resolveWarpStorage(storage);
  if (!(binding.history instanceof GitTimelineHistoryAdapter)
    || binding.createSeekCache === undefined
    || binding.createTrustChain === undefined
    || binding.hookPaths === undefined) {
    throw usageError('GitStorage returned an incomplete CLI storage binding');
  }
  return {
    persistence: binding.history,
    runtimeStorage: binding.runtimeStorage,
    createSeekCache: binding.createSeekCache,
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
export async function resolveGraphName(persistence: Persistence, explicitGraph: string | null): Promise<string> {
  if (typeof explicitGraph === 'string' && explicitGraph.length > 0) {
    return explicitGraph;
  }
  const graphNames = await listGraphNames(persistence);
  if (graphNames.length === 1) {
    return graphNames[0] as string;
  }
  if (graphNames.length === 0) {
    throw notFoundError('No graphs found in repo; specify --graph');
  }
  throw usageError('Multiple graphs found; specify --graph');
}

/**
 * Opens a WarpCore for the given CLI options.
 */
export async function openGraph(options: CliOptions): Promise<{ graph: WarpGraphInstance; graphName: string; persistence: Persistence; runtimeStorage: RuntimeStorageProviderPort; createSeekCache: (timelineName: string) => SeekCachePort; hookPaths: HookPathPort }> {
  const { persistence, runtimeStorage, createSeekCache, hookPaths } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  if (typeof options.graph === 'string' && options.graph.length > 0) {
    const graphNames = await listGraphNames(persistence);
    if (!graphNames.includes(options.graph)) {
      throw notFoundError(`Graph not found: ${options.graph}`);
    }
  }
  const graph = await openRuntimeHostProduct({
    persistence,
    runtimeStorage,
    graphName,
    writerId: options.writer,
    crypto: new WebCryptoAdapter(),
  });
  return { graph, graphName, persistence, runtimeStorage, createSeekCache, hookPaths };
}

/**
 * Reads the active cursor and sets `_seekCeiling` on the graph instance
 * so that subsequent materialize calls respect the time-travel boundary.
 */
export async function applyCursorCeiling(graph: WarpGraphInstance, persistence: Persistence, graphName: string): Promise<{ active: boolean; tick: number | null; maxTick: number | null }> {
  const cursor = await readActiveCursor(persistence, graphName);
  if (cursor) {
    graph._seekCeiling = cursor.tick;
    return { active: true, tick: cursor.tick, maxTick: null };
  }
  return { active: false, tick: null, maxTick: null };
}

/**
 * Prints a seek cursor warning banner to stderr when a cursor is active.
 */
export function emitCursorWarning(cursorInfo: { active: boolean; tick: number | null; maxTick: number | null }, maxTick: number | null): void {
  if (cursorInfo.active) {
    const tickLabel = cursorInfo.tick !== null ? String(cursorInfo.tick) : 'not set';
    const maxLabel = maxTick !== null && maxTick !== undefined ? ` of ${maxTick}` : '';
    process.stderr.write(`\u26A0 seek active (tick ${tickLabel}${maxLabel}) \u2014 run "git warp seek --latest" to return to present\n`);
  }
}

/**
 * Reads the active seek cursor for a graph from Git ref storage.
 */
export async function readActiveCursor(persistence: Persistence, graphName: string): Promise<CursorBlob | null> {
  const ref = buildCursorActiveRef(graphName);
  const oid = await persistence.readRef(ref);
  if (typeof oid !== 'string' || oid.length === 0) {
    return null;
  }
  const buf = await persistence.readBlob(oid);
  return parseCursorBlob(buf, 'active cursor');
}

/**
 * Writes (creates or overwrites) the active seek cursor for a graph.
 */
export async function writeActiveCursor(persistence: Persistence, graphName: string, cursor: CursorBlob): Promise<void> {
  const ref = buildCursorActiveRef(graphName);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(textEncode(json));
  await persistence.updateRef(ref, oid);
}

/**
 * Reads the commit date from a checkpoint SHA, if available.
 */
export async function readCheckpointDate(persistence: Persistence, checkpointSha: string | null): Promise<string | null> {
  if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
    return null;
  }
  const info = await persistence.getNodeInfo(checkpointSha);
  return (typeof info.date === 'string' && info.date.length > 0) ? info.date : null;
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
      throw usageError('Unable to locate package.json for hook installation');
    }
    current = parent;
  }
}

/**
 * Check whether stderr is a TTY (interactive terminal).
 */
export function isInteractive(): boolean {
  return Boolean(process.stderr.isTTY);
}

/**
 * Prompts the user for input via stderr and returns the trimmed response.
 */
export function promptUser(question: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Extracts the version string from raw package.json content.
 */
function readPackageVersion(rawJson: string): string {
  const raw: unknown = JSON.parse(rawJson);
  const obj = raw as { version: string };
  return obj.version;
}

/**
 * Attaches a persistent seek cache to a graph instance unless disabled by flags.
 */
export function wireSeekCache({ graph, createSeekCache, graphName, seekSpec }: {
  graph: WarpGraphInstance;
  createSeekCache: (timelineName: string) => SeekCachePort;
  graphName: string;
  seekSpec: SeekSpec;
}): void {
  if (seekSpec.noPersistentCache) {
    return;
  }
  graph.setSeekCache(createSeekCache(graphName));
}
