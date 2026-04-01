import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import { textEncode } from '../../src/domain/utils/bytes.js';
// @ts-expect-error — no type declarations for @git-stunts/plumbing
import _GitPlumbing, { ShellRunnerFactory as _ShellRunnerFactory } from '@git-stunts/plumbing';

/** @type {unknown} */
const _sfRaw = _ShellRunnerFactory;
const TypedShellRunnerFactory = /** @type {{ create: () => unknown }} */ (_sfRaw);

/** @type {unknown} */
const _gpRaw = _GitPlumbing;
const TypedGitPlumbing = /** @type {new (opts: { cwd: string, runner: unknown }) => unknown} */ (_gpRaw);
import WarpCore from '../../src/domain/WarpCore.js';
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

/**
 * Creates a persistence adapter for the given repository path.
 * @param {string} repoPath - Absolute path to the Git repository
 * @returns {Promise<{persistence: Persistence}>} Persistence adapter wrapper
 */
export async function createPersistence(repoPath) {
  const runner = TypedShellRunnerFactory.create();
  const plumbing = new TypedGitPlumbing({ cwd: repoPath, runner });
  const persistence = /** @type {Persistence} */ (/** @type {unknown} */ (new GitGraphAdapter({ plumbing })));
  const ping = await persistence.ping();
  if (!ping.ok) {
    throw usageError(`Repository not accessible: ${repoPath}`);
  }
  return { persistence };
}

/**
 * Lists all graph names found under the WARP ref prefix.
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @returns {Promise<string[]>} Sorted array of graph names
 */
export async function listGraphNames(persistence) {
  if (typeof persistence.listRefs !== 'function') {
    return [];
  }
  const refs = await persistence.listRefs(REF_PREFIX);
  const prefix = `${REF_PREFIX}/`;
  /** @type {Set<string>} */
  const names = new Set();

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

  return /** @type {string[]} */ ([...names].sort());
}

/**
 * Resolves the graph name from an explicit flag or auto-detects a single graph.
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string|null} explicitGraph - Explicit graph name from --graph flag, or null
 * @returns {Promise<string>} Resolved graph name
 */
export async function resolveGraphName(persistence, explicitGraph) {
  if (typeof explicitGraph === 'string' && explicitGraph.length > 0) {
    return explicitGraph;
  }
  const graphNames = await listGraphNames(persistence);
  if (graphNames.length === 1) {
    return /** @type {string} */ (graphNames[0]);
  }
  if (graphNames.length === 0) {
    throw notFoundError('No graphs found in repo; specify --graph');
  }
  throw usageError('Multiple graphs found; specify --graph');
}

/**
 * Opens a WarpCore for the given CLI options.
 * @param {CliOptions} options - Parsed CLI options
 * @returns {Promise<{graph: WarpGraphInstance, graphName: string, persistence: Persistence}>}
 * @throws {import('./infrastructure.js').CliError} If the specified graph is not found
 */
export async function openGraph(options) {
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  if (typeof options.graph === 'string' && options.graph.length > 0) {
    const graphNames = await listGraphNames(persistence);
    if (!graphNames.includes(options.graph)) {
      throw notFoundError(`Graph not found: ${options.graph}`);
    }
  }
  const graph = /** @type {WarpGraphInstance} */ (/** @type {unknown} */ (await WarpCore.open({
    persistence: /** @type {import('../../src/domain/types/WarpPersistence.js').CorePersistence} */ (/** @type {unknown} */ (persistence)),
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
 * @param {WarpGraphInstance} graph - WarpCore instance
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
  if (typeof oid !== 'string' || oid.length === 0) {
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
  const oid = await persistence.writeBlob(textEncode(json));
  await persistence.updateRef(ref, oid);
}

/**
 * Reads the commit date from a checkpoint SHA, if available.
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string|null} checkpointSha - Checkpoint commit SHA, or null
 */
export async function readCheckpointDate(persistence, checkpointSha) {
  if (typeof checkpointSha !== 'string' || checkpointSha.length === 0) {
    return null;
  }
  const info = await persistence.getNodeInfo(checkpointSha);
  return (typeof info.date === 'string' && info.date.length > 0) ? info.date : null;
}

/**
 * Create a HookInstaller wired with real filesystem dependencies.
 * @returns {import('../../src/domain/services/HookInstaller.js').HookInstaller}
 */
export function createHookInstaller() {
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);
  const templateDir = path.resolve(__dirname, '..', '..', 'scripts', 'hooks');
  const rawJson = fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf8');
  const version = readPackageVersion(rawJson);
  return new HookInstaller({
    fs: /** @type {import('../../src/domain/services/HookInstaller.js').FsAdapter} */ (/** @type {unknown} */ (fs)),
    execGitConfig: execGitConfigValue,
    version,
    templateDir,
    path,
  });
}

/**
 * Reads a single Git config value from the given repository.
 * @param {string} repoPath - Absolute path to the Git repository
 * @param {string} key - Git config key (or '--git-dir' for the .git directory)
 * @returns {string|null} Config value, or null if not set
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

/**
 * Check whether stderr is a TTY (interactive terminal).
 * @returns {boolean}
 */
export function isInteractive() {
  return Boolean(process.stderr.isTTY);
}

/**
 * Prompts the user for input via stderr and returns the trimmed response.
 * @param {string} question - Prompt text displayed to the user
 * @returns {Promise<string>} Trimmed user response
 */
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
 * Extracts the version string from raw package.json content.
 * @param {string} rawJson - Raw package.json file content
 * @returns {string} The package version
 */
function readPackageVersion(rawJson) {
  /** @type {unknown} */
  const raw = JSON.parse(rawJson);
  const obj = /** @type {{ version: string }} */ (raw);
  return obj.version;
}

/**
 * Attaches a persistent seek cache to a graph instance unless disabled by flags.
 * @param {{graph: WarpGraphInstance, persistence: Persistence, graphName: string, seekSpec: SeekSpec}} params - Seek wiring parameters
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
