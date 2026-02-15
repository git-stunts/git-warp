import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
// @ts-expect-error — no type declarations for @git-stunts/plumbing
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import WarpGraph from '../../src/domain/WarpGraph.js';
import GitGraphAdapter from '../../src/infrastructure/adapters/GitGraphAdapter.js';
import WebCryptoAdapter from '../../src/infrastructure/adapters/WebCryptoAdapter.js';
import {
  REF_PREFIX,
  buildCursorActiveRef,
} from '../../src/domain/utils/RefLayout.js';
import CasSeekCacheAdapter from '../../src/infrastructure/adapters/CasSeekCacheAdapter.js';
import { HookInstaller } from '../../src/domain/services/HookInstaller.js';
import { parseCursorBlob } from '../../src/domain/utils/parseCursorBlob.js';
import { usageError, notFoundError } from './infrastructure.js';

/** @typedef {import('./types.js').Persistence} Persistence */
/** @typedef {import('./types.js').WarpGraphInstance} WarpGraphInstance */
/** @typedef {import('./types.js').CursorBlob} CursorBlob */
/** @typedef {import('./types.js').CliOptions} CliOptions */
/** @typedef {import('./types.js').SeekSpec} SeekSpec */

/** @param {string} repoPath @returns {Promise<{persistence: Persistence}>} */
export async function createPersistence(repoPath) {
  const runner = ShellRunnerFactory.create();
  const plumbing = new GitPlumbing({ cwd: repoPath, runner });
  const persistence = new GitGraphAdapter({ plumbing });
  const ping = await persistence.ping();
  if (!ping.ok) {
    throw usageError(`Repository not accessible: ${repoPath}`);
  }
  return { persistence };
}

/** @param {Persistence} persistence @returns {Promise<string[]>} */
export async function listGraphNames(persistence) {
  if (typeof persistence.listRefs !== 'function') {
    return [];
  }
  const refs = await persistence.listRefs(REF_PREFIX);
  const prefix = `${REF_PREFIX}/`;
  const names = new Set();

  for (const ref of refs) {
    if (!ref.startsWith(prefix)) {
      continue;
    }
    const rest = ref.slice(prefix.length);
    const [graphName] = rest.split('/');
    if (graphName) {
      names.add(graphName);
    }
  }

  return [...names].sort();
}

/**
 * @param {Persistence} persistence
 * @param {string|null} explicitGraph
 * @returns {Promise<string>}
 */
export async function resolveGraphName(persistence, explicitGraph) {
  if (explicitGraph) {
    return explicitGraph;
  }
  const graphNames = await listGraphNames(persistence);
  if (graphNames.length === 1) {
    return graphNames[0];
  }
  if (graphNames.length === 0) {
    throw notFoundError('No graphs found in repo; specify --graph');
  }
  throw usageError('Multiple graphs found; specify --graph');
}

/**
 * Opens a WarpGraph for the given CLI options.
 * @param {CliOptions} options - Parsed CLI options
 * @returns {Promise<{graph: WarpGraphInstance, graphName: string, persistence: Persistence}>}
 * @throws {import('./infrastructure.js').CliError} If the specified graph is not found
 */
export async function openGraph(options) {
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  if (options.graph) {
    const graphNames = await listGraphNames(persistence);
    if (!graphNames.includes(options.graph)) {
      throw notFoundError(`Graph not found: ${options.graph}`);
    }
  }
  const graph = /** @type {WarpGraphInstance} */ (/** @type {*} */ (await WarpGraph.open({ // TODO(ts-cleanup): narrow port type
    persistence,
    graphName,
    writerId: options.writer,
    crypto: new WebCryptoAdapter(),
  })));
  return { graph, graphName, persistence };
}

/**
 * Reads the active cursor and sets `_seekCeiling` on the graph instance
 * so that subsequent materialize calls respect the time-travel boundary.
 *
 * @param {WarpGraphInstance} graph - WarpGraph instance
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @returns {Promise<{active: boolean, tick: number|null, maxTick: number|null}>}
 */
export async function applyCursorCeiling(graph, persistence, graphName) {
  const cursor = await readActiveCursor(persistence, graphName);
  if (cursor) {
    graph._seekCeiling = cursor.tick;
    return { active: true, tick: cursor.tick, maxTick: null };
  }
  return { active: false, tick: null, maxTick: null };
}

/**
 * Prints a seek cursor warning banner to stderr when a cursor is active.
 *
 * @param {{active: boolean, tick: number|null, maxTick: number|null}} cursorInfo
 * @param {number|null} maxTick
 * @returns {void}
 */
export function emitCursorWarning(cursorInfo, maxTick) {
  if (cursorInfo.active) {
    const maxLabel = maxTick !== null && maxTick !== undefined ? ` of ${maxTick}` : '';
    process.stderr.write(`\u26A0 seek active (tick ${cursorInfo.tick}${maxLabel}) \u2014 run "git warp seek --latest" to return to present\n`);
  }
}

/**
 * Reads the active seek cursor for a graph from Git ref storage.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @returns {Promise<CursorBlob|null>}
 */
export async function readActiveCursor(persistence, graphName) {
  const ref = buildCursorActiveRef(graphName);
  const oid = await persistence.readRef(ref);
  if (!oid) {
    return null;
  }
  const buf = await persistence.readBlob(oid);
  return parseCursorBlob(buf, 'active cursor');
}

/**
 * Writes (creates or overwrites) the active seek cursor for a graph.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @param {CursorBlob} cursor - Cursor state to persist
 * @returns {Promise<void>}
 */
export async function writeActiveCursor(persistence, graphName, cursor) {
  const ref = buildCursorActiveRef(graphName);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(Buffer.from(json, 'utf8'));
  await persistence.updateRef(ref, oid);
}

/**
 * @param {Persistence} persistence
 * @param {string|null} checkpointSha
 */
export async function readCheckpointDate(persistence, checkpointSha) {
  if (!checkpointSha) {
    return null;
  }
  const info = await persistence.getNodeInfo(checkpointSha);
  return info.date || null;
}

export function createHookInstaller() {
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);
  const templateDir = path.resolve(__dirname, '..', '..', 'scripts', 'hooks');
  const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8'));
  return new HookInstaller({
    fs: /** @type {*} */ (fs), // TODO(ts-cleanup): narrow port type
    execGitConfig: execGitConfigValue,
    version,
    templateDir,
    path,
  });
}

/**
 * @param {string} repoPath
 * @param {string} key
 * @returns {string|null}
 */
export function execGitConfigValue(repoPath, key) {
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

export function isInteractive() {
  return Boolean(process.stderr.isTTY);
}

/** @param {string} question @returns {Promise<string>} */
export function promptUser(question) {
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
 * @param {{graph: WarpGraphInstance, persistence: Persistence, graphName: string, seekSpec: SeekSpec}} params
 */
export function wireSeekCache({ graph, persistence, graphName, seekSpec }) {
  if (seekSpec.noPersistentCache) {
    return;
  }
  graph.setSeekCache(new CasSeekCacheAdapter({
    persistence,
    plumbing: persistence.plumbing,
    graphName,
  }));
}
