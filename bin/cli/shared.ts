import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { textEncode } from '../../src/domain/utils/bytes.ts';
import _GitPlumbing, { ShellRunnerFactory as _ShellRunnerFactory } from '@git-stunts/plumbing';

const _sfRaw: unknown = _ShellRunnerFactory;
const TypedShellRunnerFactory = _sfRaw as { create: () => unknown };

const _gpRaw: unknown = _GitPlumbing;
const TypedGitPlumbing = _gpRaw as new (opts: { cwd: string; runner: unknown }) => unknown;
import WarpCore from '../../src/domain/WarpCore.ts';
import GitGraphAdapter, { type GitPlumbingLike } from '../../src/infrastructure/adapters/GitGraphAdapter.ts';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.ts';
import {
  REF_PREFIX,
  buildCursorActiveRef,
} from '../../src/domain/utils/RefLayout.ts';
import CasSeekCacheAdapter from '../../src/infrastructure/adapters/CasSeekCacheAdapter.ts';
import { HookInstaller, type FsAdapter } from '../../src/domain/services/HookInstaller.ts';
import { parseCursorBlob } from '../../src/domain/utils/parseCursorBlob.ts';
import { usageError, notFoundError } from './infrastructure.ts';

import type { Persistence, WarpGraphInstance, CursorBlob, CliOptions, SeekSpec } from './types.ts';
import type { CorePersistence } from '../../src/domain/types/WarpPersistence.ts';

/**
 * Creates a persistence adapter for the given repository path.
 */
export async function createPersistence(repoPath: string): Promise<{ persistence: Persistence }> {
  const runner = TypedShellRunnerFactory.create();
  const plumbing = new TypedGitPlumbing({ cwd: repoPath, runner });
  const persistence = new GitGraphAdapter({ plumbing: plumbing as GitPlumbingLike }) as unknown as Persistence;
  const ping = await persistence.ping();
  if (!ping.ok) {
    throw usageError(`Repository not accessible: ${repoPath}`);
  }
  return { persistence };
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
export async function openGraph(options: CliOptions): Promise<{ graph: WarpGraphInstance; graphName: string; persistence: Persistence }> {
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  if (typeof options.graph === 'string' && options.graph.length > 0) {
    const graphNames = await listGraphNames(persistence);
    if (!graphNames.includes(options.graph)) {
      throw notFoundError(`Graph not found: ${options.graph}`);
    }
  }
  const graph = await WarpCore.open({
    persistence: persistence as unknown as CorePersistence,
    graphName,
    writerId: options.writer,
    crypto: new WebCryptoAdapter(),
  }) as unknown as WarpGraphInstance;
  return { graph, graphName, persistence };
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
    const maxLabel = maxTick !== null && maxTick !== undefined ? ` of ${maxTick}` : '';
    process.stderr.write(`\u26A0 seek active (tick ${cursorInfo.tick}${maxLabel}) \u2014 run "git warp seek --latest" to return to present\n`);
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
export function createHookInstaller(): HookInstaller {
  const packageRoot = fileURLToPath(new URL('../..', import.meta.url));
  const templateDir = path.join(packageRoot, 'scripts', 'hooks');
  const rawJson = fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8');
  const version = readPackageVersion(rawJson);
  return new HookInstaller({
    fs: fs as unknown as FsAdapter,
    execGitConfig: execGitConfigValue,
    version,
    templateDir,
    path,
  });
}

/**
 * Reads a single Git config value from the given repository.
 */
function execGitConfigValue(repoPath: string, key: string): string | null {
  try {
    if (key === '--git-dir') {
      return execFileSync('git', ['-C', repoPath, 'rev-parse', '--git-dir'], {
        encoding: 'utf8',
      }).trim();
    }
    return execFileSync('git', ['-C', repoPath, 'config', key], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return null;
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
export function wireSeekCache({ graph, persistence, graphName, seekSpec }: { graph: WarpGraphInstance; persistence: Persistence; graphName: string; seekSpec: SeekSpec }): void {
  if (seekSpec.noPersistentCache) {
    return;
  }
  graph.setSeekCache(new CasSeekCacheAdapter({
    persistence,
    plumbing: persistence.plumbing,
    graphName,
  }));
}
