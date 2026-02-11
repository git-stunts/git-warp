#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
// @ts-expect-error — no type declarations for @git-stunts/plumbing
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import WarpGraph from '../src/domain/WarpGraph.js';
import GitGraphAdapter from '../src/infrastructure/adapters/GitGraphAdapter.js';
import HealthCheckService from '../src/domain/services/HealthCheckService.js';
import ClockAdapter from '../src/infrastructure/adapters/ClockAdapter.js';
import NodeCryptoAdapter from '../src/infrastructure/adapters/NodeCryptoAdapter.js';
import {
  REF_PREFIX,
  buildCheckpointRef,
  buildCoverageRef,
  buildWritersPrefix,
  parseWriterIdFromRef,
  buildCursorActiveRef,
  buildCursorSavedRef,
  buildCursorSavedPrefix,
} from '../src/domain/utils/RefLayout.js';
import CasSeekCacheAdapter from '../src/infrastructure/adapters/CasSeekCacheAdapter.js';
import { HookInstaller, classifyExistingHook } from '../src/domain/services/HookInstaller.js';
import { renderInfoView } from '../src/visualization/renderers/ascii/info.js';
import { renderCheckView } from '../src/visualization/renderers/ascii/check.js';
import { renderHistoryView, summarizeOps } from '../src/visualization/renderers/ascii/history.js';
import { renderPathView } from '../src/visualization/renderers/ascii/path.js';
import { renderMaterializeView } from '../src/visualization/renderers/ascii/materialize.js';
import { parseCursorBlob } from '../src/domain/utils/parseCursorBlob.js';
import { diffStates } from '../src/domain/services/StateDiff.js';
import { renderSeekView, formatStructuralDiff } from '../src/visualization/renderers/ascii/seek.js';
import { renderGraphView } from '../src/visualization/renderers/ascii/graph.js';
import { renderSvg } from '../src/visualization/renderers/svg/index.js';
import { layoutGraph, queryResultToGraphData, pathResultToGraphData } from '../src/visualization/layouts/index.js';

/**
 * @typedef {Object} Persistence
 * @property {(prefix: string) => Promise<string[]>} listRefs
 * @property {(ref: string) => Promise<string|null>} readRef
 * @property {(ref: string, oid: string) => Promise<void>} updateRef
 * @property {(ref: string) => Promise<void>} deleteRef
 * @property {(oid: string) => Promise<Buffer>} readBlob
 * @property {(buf: Buffer) => Promise<string>} writeBlob
 * @property {(sha: string) => Promise<{date?: string|null}>} getNodeInfo
 * @property {(sha: string, coverageSha: string) => Promise<boolean>} isAncestor
 * @property {() => Promise<{ok: boolean}>} ping
 * @property {*} plumbing
 */

/**
 * @typedef {Object} WarpGraphInstance
 * @property {(opts?: {ceiling?: number}) => Promise<void>} materialize
 * @property {() => Promise<Array<{id: string}>>} getNodes
 * @property {() => Promise<Array<{from: string, to: string, label?: string}>>} getEdges
 * @property {() => Promise<string|null>} createCheckpoint
 * @property {() => *} query
 * @property {{ shortestPath: Function }} traverse
 * @property {(writerId: string) => Promise<Array<{patch: any, sha: string}>>} getWriterPatches
 * @property {() => Promise<{frontier: Record<string, any>}>} status
 * @property {() => Promise<Map<string, any>>} getFrontier
 * @property {() => {totalTombstones: number, tombstoneRatio: number}} getGCMetrics
 * @property {() => Promise<number>} getPropertyCount
 * @property {() => Promise<import('../src/domain/services/JoinReducer.js').WarpStateV5 | null>} getStateSnapshot
 * @property {() => Promise<{ticks: number[], maxTick: number, perWriter: Map<string, WriterTickInfo>}>} discoverTicks
 * @property {(sha: string) => Promise<{ops?: any[]}>} loadPatchBySha
 * @property {(cache: any) => void} setSeekCache
 * @property {*} seekCache
 * @property {number} [_seekCeiling]
 * @property {boolean} [_provenanceDegraded]
 */

/**
 * @typedef {Object} WriterTickInfo
 * @property {number[]} ticks
 * @property {string|null} tipSha
 * @property {Record<number, string>} [tickShas]
 */

/**
 * @typedef {Object} CursorBlob
 * @property {number} tick
 * @property {string} [mode]
 * @property {number} [nodes]
 * @property {number} [edges]
 * @property {string} [frontierHash]
 */

/**
 * @typedef {Object} CliOptions
 * @property {string} repo
 * @property {boolean} json
 * @property {string|null} view
 * @property {string|null} graph
 * @property {string} writer
 * @property {boolean} help
 */

/**
 * @typedef {Object} GraphInfoResult
 * @property {string} name
 * @property {{count: number, ids?: string[]}} writers
 * @property {{ref: string, sha: string|null, date?: string|null}} [checkpoint]
 * @property {{ref: string, sha: string|null}} [coverage]
 * @property {Record<string, number>} [writerPatches]
 * @property {{active: boolean, tick?: number, mode?: string}} [cursor]
 */

/**
 * @typedef {Object} SeekSpec
 * @property {string} action
 * @property {string|null} tickValue
 * @property {string|null} name
 * @property {boolean} noPersistentCache
 * @property {boolean} diff
 * @property {number} diffLimit
 */

const EXIT_CODES = {
  OK: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  INTERNAL: 3,
};

const HELP_TEXT = `warp-graph <command> [options]
(or: git warp <command> [options])

Commands:
  info             Summarize graphs in the repo
  query            Run a logical graph query
  path             Find a logical path between two nodes
  history          Show writer history
  check            Report graph health/GC status
  materialize      Materialize and checkpoint all graphs
  seek             Time-travel: step through graph history by Lamport tick
  view             Interactive TUI graph browser (requires @git-stunts/git-warp-tui)
  install-hooks    Install post-merge git hook

Options:
  --repo <path>     Path to git repo (default: cwd)
  --json            Emit JSON output
  --view [mode]     Visual output (ascii, browser, svg:FILE, html:FILE)
  --graph <name>    Graph name (required if repo has multiple graphs)
  --writer <id>     Writer id (default: cli)
  -h, --help        Show this help

Install-hooks options:
  --force           Replace existing hook (backs up original)

Query options:
  --match <glob>        Match node ids (default: *)
  --outgoing [label]    Traverse outgoing edge (repeatable)
  --incoming [label]    Traverse incoming edge (repeatable)
  --where-prop k=v      Filter nodes by prop equality (repeatable)
  --select <fields>     Fields to select (id, props)

Path options:
  --from <id>           Start node id
  --to <id>             End node id
  --dir <out|in|both>   Traversal direction (default: out)
  --label <label>       Filter by edge label (repeatable, comma-separated)
  --max-depth <n>       Maximum depth

History options:
  --node <id>           Filter patches touching node id

Seek options:
  --tick <N|+N|-N>      Jump to tick N, or step forward/backward
  --latest              Clear cursor, return to present
  --save <name>         Save current position as named cursor
  --load <name>         Restore a saved cursor
  --list                List all saved cursors
  --drop <name>         Delete a saved cursor
  --diff                Show structural diff (added/removed nodes, edges, props)
  --diff-limit <N>      Max diff entries (default 2000)
`;

/**
 * Structured CLI error with exit code and error code.
 */
class CliError extends Error {
  /**
   * @param {string} message - Human-readable error message
   * @param {Object} [options]
   * @param {string} [options.code='E_CLI'] - Machine-readable error code
   * @param {number} [options.exitCode=3] - Process exit code
   * @param {Error} [options.cause] - Underlying cause
   */
  constructor(message, { code = 'E_CLI', exitCode = EXIT_CODES.INTERNAL, cause } = {}) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.cause = cause;
  }
}

/** @param {string} message */
function usageError(message) {
  return new CliError(message, { code: 'E_USAGE', exitCode: EXIT_CODES.USAGE });
}

/** @param {string} message */
function notFoundError(message) {
  return new CliError(message, { code: 'E_NOT_FOUND', exitCode: EXIT_CODES.NOT_FOUND });
}

/** @param {*} value */
function stableStringify(value) {
  /** @param {*} input @returns {*} */
  const normalize = (input) => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }
    if (input && typeof input === 'object') {
      /** @type {Record<string, *>} */
      const sorted = {};
      for (const key of Object.keys(input).sort()) {
        sorted[key] = normalize(input[key]);
      }
      return sorted;
    }
    return input;
  };

  return JSON.stringify(normalize(value), null, 2);
}

/** @param {string[]} argv */
function parseArgs(argv) {
  const options = createDefaultOptions();
  /** @type {string[]} */
  const positionals = [];
  const optionDefs = [
    { flag: '--repo', shortFlag: '-r', key: 'repo' },
    { flag: '--graph', key: 'graph' },
    { flag: '--writer', key: 'writer' },
  ];

  for (let i = 0; i < argv.length; i += 1) {
    const result = consumeBaseArg({ argv, index: i, options, optionDefs, positionals });
    if (result.done) {
      break;
    }
    i += result.consumed;
  }

  options.repo = path.resolve(options.repo);
  return { options, positionals };
}

function createDefaultOptions() {
  return {
    repo: process.cwd(),
    json: false,
    view: null,
    graph: null,
    writer: 'cli',
    help: false,
  };
}

/**
 * @param {Object} params
 * @param {string[]} params.argv
 * @param {number} params.index
 * @param {Record<string, *>} params.options
 * @param {Array<{flag: string, shortFlag?: string, key: string}>} params.optionDefs
 * @param {string[]} params.positionals
 */
function consumeBaseArg({ argv, index, options, optionDefs, positionals }) {
  const arg = argv[index];

  if (arg === '--') {
    positionals.push(...argv.slice(index + 1));
    return { consumed: argv.length - index - 1, done: true };
  }

  if (arg === '--json') {
    options.json = true;
    return { consumed: 0 };
  }

  if (arg === '--view') {
    // Valid view modes: ascii, browser, svg:FILE, html:FILE
    // Don't consume known commands as modes
    const KNOWN_COMMANDS = ['info', 'query', 'path', 'history', 'check', 'materialize', 'seek', 'install-hooks'];
    const nextArg = argv[index + 1];
    const isViewMode = nextArg &&
      !nextArg.startsWith('-') &&
      !KNOWN_COMMANDS.includes(nextArg);
    if (isViewMode) {
      // Validate the view mode value
      const validModes = ['ascii', 'browser'];
      const validPrefixes = ['svg:', 'html:'];
      const isValid = validModes.includes(nextArg) ||
        validPrefixes.some((prefix) => nextArg.startsWith(prefix));
      if (!isValid) {
        throw usageError(`Invalid view mode: ${nextArg}. Valid modes: ascii, browser, svg:FILE, html:FILE`);
      }
      options.view = nextArg;
      return { consumed: 1 };
    }
    options.view = 'ascii'; // default mode
    return { consumed: 0 };
  }

  if (arg === '-h' || arg === '--help') {
    options.help = true;
    return { consumed: 0 };
  }

  const matched = matchOptionDef(arg, optionDefs);
  if (matched) {
    const result = readOptionValue({
      args: argv,
      index,
      flag: matched.flag,
      shortFlag: matched.shortFlag,
      allowEmpty: false,
    });
    if (result) {
      options[matched.key] = result.value;
      return { consumed: result.consumed };
    }
  }

  if (arg.startsWith('-')) {
    throw usageError(`Unknown option: ${arg}`);
  }

  positionals.push(arg, ...argv.slice(index + 1));
  return { consumed: argv.length - index - 1, done: true };
}

/**
 * @param {string} arg
 * @param {Array<{flag: string, shortFlag?: string, key: string}>} optionDefs
 */
function matchOptionDef(arg, optionDefs) {
  return optionDefs.find((def) =>
    arg === def.flag ||
    arg === def.shortFlag ||
    arg.startsWith(`${def.flag}=`)
  );
}

/** @param {string} repoPath @returns {Promise<{persistence: Persistence}>} */
async function createPersistence(repoPath) {
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
async function listGraphNames(persistence) {
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
async function resolveGraphName(persistence, explicitGraph) {
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
 * Collects metadata about a single graph (writer count, refs, patches, checkpoint).
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the graph to inspect
 * @param {Object} [options]
 * @param {boolean} [options.includeWriterIds=false] - Include writer ID list
 * @param {boolean} [options.includeRefs=false] - Include checkpoint/coverage refs
 * @param {boolean} [options.includeWriterPatches=false] - Include per-writer patch counts
 * @param {boolean} [options.includeCheckpointDate=false] - Include checkpoint date
 * @returns {Promise<GraphInfoResult>} Graph info object
 */
async function getGraphInfo(persistence, graphName, {
  includeWriterIds = false,
  includeRefs = false,
  includeWriterPatches = false,
  includeCheckpointDate = false,
} = {}) {
  const writersPrefix = buildWritersPrefix(graphName);
  const writerRefs = typeof persistence.listRefs === 'function'
    ? await persistence.listRefs(writersPrefix)
    : [];
  const writerIds = /** @type {string[]} */ (writerRefs
    .map((ref) => parseWriterIdFromRef(ref))
    .filter(Boolean)
    .sort());

  /** @type {GraphInfoResult} */
  const info = {
    name: graphName,
    writers: {
      count: writerIds.length,
    },
  };

  if (includeWriterIds) {
    info.writers.ids = writerIds;
  }

  if (includeRefs || includeCheckpointDate) {
    const checkpointRef = buildCheckpointRef(graphName);
    const checkpointSha = await persistence.readRef(checkpointRef);

    /** @type {{ref: string, sha: string|null, date?: string|null}} */
    const checkpoint = { ref: checkpointRef, sha: checkpointSha || null };

    if (includeCheckpointDate && checkpointSha) {
      const checkpointDate = await readCheckpointDate(persistence, checkpointSha);
      checkpoint.date = checkpointDate;
    }

    info.checkpoint = checkpoint;

    if (includeRefs) {
      const coverageRef = buildCoverageRef(graphName);
      const coverageSha = await persistence.readRef(coverageRef);
      info.coverage = { ref: coverageRef, sha: coverageSha || null };
    }
  }

  if (includeWriterPatches && writerIds.length > 0) {
    const graph = await WarpGraph.open({
      persistence,
      graphName,
      writerId: 'cli',
      crypto: new NodeCryptoAdapter(),
    });
    /** @type {Record<string, number>} */
    const writerPatches = {};
    for (const writerId of writerIds) {
      const patches = await graph.getWriterPatches(writerId);
      writerPatches[/** @type {string} */ (writerId)] = patches.length;
    }
    info.writerPatches = writerPatches;
  }

  return info;
}

/**
 * Opens a WarpGraph for the given CLI options.
 * @param {CliOptions} options - Parsed CLI options
 * @returns {Promise<{graph: WarpGraphInstance, graphName: string, persistence: Persistence}>}
 * @throws {CliError} If the specified graph is not found
 */
async function openGraph(options) {
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
    crypto: new NodeCryptoAdapter(),
  })));
  return { graph, graphName, persistence };
}

/** @param {string[]} args */
function parseQueryArgs(args) {
  const spec = {
    match: null,
    select: null,
    steps: [],
  };

  for (let i = 0; i < args.length; i += 1) {
    const result = consumeQueryArg(args, i, spec);
    if (!result) {
      throw usageError(`Unknown query option: ${args[i]}`);
    }
    i += result.consumed;
  }

  return spec;
}

/**
 * @param {string[]} args
 * @param {number} index
 * @param {{match: string|null, select: string[]|null, steps: Array<{type: string, label?: string, key?: string, value?: string}>}} spec
 */
function consumeQueryArg(args, index, spec) {
  const stepResult = readTraversalStep(args, index);
  if (stepResult) {
    spec.steps.push(stepResult.step);
    return stepResult;
  }

  const matchResult = readOptionValue({
    args,
    index,
    flag: '--match',
    allowEmpty: true,
  });
  if (matchResult) {
    spec.match = matchResult.value;
    return matchResult;
  }

  const whereResult = readOptionValue({
    args,
    index,
    flag: '--where-prop',
    allowEmpty: false,
  });
  if (whereResult) {
    spec.steps.push(parseWhereProp(whereResult.value));
    return whereResult;
  }

  const selectResult = readOptionValue({
    args,
    index,
    flag: '--select',
    allowEmpty: true,
  });
  if (selectResult) {
    spec.select = parseSelectFields(selectResult.value);
    return selectResult;
  }

  return null;
}

/** @param {string} value */
function parseWhereProp(value) {
  const [key, ...rest] = value.split('=');
  if (!key || rest.length === 0) {
    throw usageError('Expected --where-prop key=value');
  }
  return { type: 'where-prop', key, value: rest.join('=') };
}

/** @param {string} value */
function parseSelectFields(value) {
  if (value === '') {
    return [];
  }
  return value.split(',').map((field) => field.trim()).filter(Boolean);
}

/**
 * @param {string[]} args
 * @param {number} index
 */
function readTraversalStep(args, index) {
  const arg = args[index];
  if (arg !== '--outgoing' && arg !== '--incoming') {
    return null;
  }
  const next = args[index + 1];
  const label = next && !next.startsWith('-') ? next : undefined;
  const consumed = label ? 1 : 0;
  return { step: { type: arg.slice(2), label }, consumed };
}

/**
 * @param {{args: string[], index: number, flag: string, shortFlag?: string, allowEmpty?: boolean}} params
 */
function readOptionValue({ args, index, flag, shortFlag, allowEmpty = false }) {
  const arg = args[index];
  if (matchesOptionFlag(arg, flag, shortFlag)) {
    return readNextOptionValue({ args, index, flag, allowEmpty });
  }

  if (arg.startsWith(`${flag}=`)) {
    return readInlineOptionValue({ arg, flag, allowEmpty });
  }

  return null;
}

/**
 * @param {string} arg
 * @param {string} flag
 * @param {string} [shortFlag]
 */
function matchesOptionFlag(arg, flag, shortFlag) {
  return arg === flag || (shortFlag && arg === shortFlag);
}

/** @param {{args: string[], index: number, flag: string, allowEmpty?: boolean}} params */
function readNextOptionValue({ args, index, flag, allowEmpty }) {
  const value = args[index + 1];
  if (value === undefined || (!allowEmpty && value === '')) {
    throw usageError(`Missing value for ${flag}`);
  }
  return { value, consumed: 1 };
}

/** @param {{arg: string, flag: string, allowEmpty?: boolean}} params */
function readInlineOptionValue({ arg, flag, allowEmpty }) {
  const value = arg.slice(flag.length + 1);
  if (!allowEmpty && value === '') {
    throw usageError(`Missing value for ${flag}`);
  }
  return { value, consumed: 0 };
}

/** @param {string[]} args */
function parsePathArgs(args) {
  const options = createPathOptions();
  /** @type {string[]} */
  const labels = [];
  /** @type {string[]} */
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const result = consumePathArg({ args, index: i, options, labels, positionals });
    i += result.consumed;
  }

  finalizePathOptions(options, labels, positionals);
  return options;
}

/** @returns {{from: string|null, to: string|null, dir: string|undefined, labelFilter: string|string[]|undefined, maxDepth: number|undefined}} */
function createPathOptions() {
  return {
    from: null,
    to: null,
    dir: undefined,
    labelFilter: undefined,
    maxDepth: undefined,
  };
}

/**
 * @param {{args: string[], index: number, options: ReturnType<typeof createPathOptions>, labels: string[], positionals: string[]}} params
 */
function consumePathArg({ args, index, options, labels, positionals }) {
  const arg = args[index];
  /** @type {Array<{flag: string, apply: (value: string) => void}>} */
  const handlers = [
    { flag: '--from', apply: (value) => { options.from = value; } },
    { flag: '--to', apply: (value) => { options.to = value; } },
    { flag: '--dir', apply: (value) => { options.dir = value; } },
    { flag: '--label', apply: (value) => { labels.push(...parseLabels(value)); } },
    { flag: '--max-depth', apply: (value) => { options.maxDepth = parseMaxDepth(value); } },
  ];

  for (const handler of handlers) {
    const result = readOptionValue({ args, index, flag: handler.flag });
    if (result) {
      handler.apply(result.value);
      return result;
    }
  }

  if (arg.startsWith('-')) {
    throw usageError(`Unknown path option: ${arg}`);
  }

  positionals.push(arg);
  return { consumed: 0 };
}

/**
 * @param {ReturnType<typeof createPathOptions>} options
 * @param {string[]} labels
 * @param {string[]} positionals
 */
function finalizePathOptions(options, labels, positionals) {
  if (!options.from) {
    options.from = positionals[0] || null;
  }

  if (!options.to) {
    options.to = positionals[1] || null;
  }

  if (!options.from || !options.to) {
    throw usageError('Path requires --from and --to (or two positional ids)');
  }

  if (labels.length === 1) {
    options.labelFilter = labels[0];
  } else if (labels.length > 1) {
    options.labelFilter = labels;
  }
}

/** @param {string} value */
function parseLabels(value) {
  return value.split(',').map((label) => label.trim()).filter(Boolean);
}

/** @param {string} value */
function parseMaxDepth(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw usageError('Invalid value for --max-depth');
  }
  return parsed;
}

/** @param {string[]} args */
function parseHistoryArgs(args) {
  /** @type {{node: string|null}} */
  const options = { node: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--node') {
      const value = args[i + 1];
      if (!value) {
        throw usageError('Missing value for --node');
      }
      options.node = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--node=')) {
      options.node = arg.slice('--node='.length);
      continue;
    }

    if (arg.startsWith('-')) {
      throw usageError(`Unknown history option: ${arg}`);
    }

    throw usageError(`Unexpected history argument: ${arg}`);
  }

  return options;
}

/**
 * @param {*} patch
 * @param {string} nodeId
 */
function patchTouchesNode(patch, nodeId) {
  const ops = Array.isArray(patch?.ops) ? patch.ops : [];
  for (const op of ops) {
    if (op.node === nodeId) {
      return true;
    }
    if (op.from === nodeId || op.to === nodeId) {
      return true;
    }
  }
  return false;
}

/** @param {*} payload */
function renderInfo(payload) {
  const lines = [`Repo: ${payload.repo}`];
  lines.push(`Graphs: ${payload.graphs.length}`);
  for (const graph of payload.graphs) {
    const writers = graph.writers ? ` writers=${graph.writers.count}` : '';
    lines.push(`- ${graph.name}${writers}`);
    if (graph.checkpoint?.sha) {
      lines.push(`  checkpoint: ${graph.checkpoint.sha}`);
    }
    if (graph.coverage?.sha) {
      lines.push(`  coverage: ${graph.coverage.sha}`);
    }
    if (graph.cursor?.active) {
      lines.push(`  cursor: tick ${graph.cursor.tick} (${graph.cursor.mode})`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
function renderQuery(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `State: ${payload.stateHash}`,
    `Nodes: ${payload.nodes.length}`,
  ];

  for (const node of payload.nodes) {
    const id = node.id ?? '(unknown)';
    lines.push(`- ${id}`);
    if (node.props && Object.keys(node.props).length > 0) {
      lines.push(`  props: ${JSON.stringify(node.props)}`);
    }
  }

  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
function renderPath(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `From: ${payload.from}`,
    `To: ${payload.to}`,
    `Found: ${payload.found ? 'yes' : 'no'}`,
    `Length: ${payload.length}`,
  ];

  if (payload.path && payload.path.length > 0) {
    lines.push(`Path: ${payload.path.join(' -> ')}`);
  }

  return `${lines.join('\n')}\n`;
}

const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_RED = '\x1b[31m';
const ANSI_DIM = '\x1b[2m';
const ANSI_RESET = '\x1b[0m';

/** @param {string} state */
function colorCachedState(state) {
  if (state === 'fresh') {
    return `${ANSI_GREEN}${state}${ANSI_RESET}`;
  }
  if (state === 'stale') {
    return `${ANSI_YELLOW}${state}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${ANSI_DIM}${state}${ANSI_RESET}`;
}

/** @param {*} payload */
function renderCheck(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Health: ${payload.health.status}`,
  ];

  if (payload.status) {
    lines.push(`Cached State: ${colorCachedState(payload.status.cachedState)}`);
    lines.push(`Patches Since Checkpoint: ${payload.status.patchesSinceCheckpoint}`);
    lines.push(`Tombstone Ratio: ${payload.status.tombstoneRatio.toFixed(2)}`);
    lines.push(`Writers: ${payload.status.writers}`);
  }

  if (payload.checkpoint?.sha) {
    lines.push(`Checkpoint: ${payload.checkpoint.sha}`);
    if (payload.checkpoint.ageSeconds !== null) {
      lines.push(`Checkpoint Age: ${payload.checkpoint.ageSeconds}s`);
    }
  } else {
    lines.push('Checkpoint: none');
  }

  if (!payload.status) {
    lines.push(`Writers: ${payload.writers.count}`);
  }
  for (const head of payload.writers.heads) {
    lines.push(`- ${head.writerId}: ${head.sha}`);
  }

  if (payload.coverage?.sha) {
    lines.push(`Coverage: ${payload.coverage.sha}`);
    lines.push(`Coverage Missing: ${payload.coverage.missingWriters.length}`);
  } else {
    lines.push('Coverage: none');
  }

  if (payload.gc) {
    lines.push(`Tombstones: ${payload.gc.totalTombstones}`);
    if (!payload.status) {
      lines.push(`Tombstone Ratio: ${payload.gc.tombstoneRatio}`);
    }
  }

  if (payload.hook) {
    lines.push(formatHookStatusLine(payload.hook));
  }

  return `${lines.join('\n')}\n`;
}

/** @param {*} hook */
function formatHookStatusLine(hook) {
  if (!hook.installed && hook.foreign) {
    return "Hook: foreign hook present — run 'git warp install-hooks'";
  }
  if (!hook.installed) {
    return "Hook: not installed — run 'git warp install-hooks'";
  }
  if (hook.current) {
    return `Hook: installed (v${hook.version}) — up to date`;
  }
  return `Hook: installed (v${hook.version}) — upgrade available, run 'git warp install-hooks'`;
}

/** @param {*} payload */
function renderHistory(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Writer: ${payload.writer}`,
    `Entries: ${payload.entries.length}`,
  ];

  if (payload.nodeFilter) {
    lines.push(`Node Filter: ${payload.nodeFilter}`);
  }

  for (const entry of payload.entries) {
    lines.push(`- ${entry.sha} (lamport: ${entry.lamport}, ops: ${entry.opCount})`);
  }

  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
function renderError(payload) {
  return `Error: ${payload.error.message}\n`;
}

/**
 * Wraps SVG content in a minimal HTML document and writes it to disk.
 * @param {string} filePath - Destination file path
 * @param {string} svgContent - SVG markup to embed
 */
function writeHtmlExport(filePath, svgContent) {
  const html = `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>git-warp</title></head><body>\n${svgContent}\n</body></html>`;
  fs.writeFileSync(filePath, html);
}

/**
 * Writes a command result to stdout/stderr in the appropriate format.
 * Dispatches to JSON, SVG file, HTML file, ASCII view, or plain text
 * based on the combination of flags.
 * @param {*} payload - Command result payload
 * @param {{json: boolean, command: string, view: string|null}} options
 */
function emit(payload, { json, command, view }) {
  if (json) {
    process.stdout.write(`${stableStringify(payload)}\n`);
    return;
  }

  if (command === 'info') {
    if (view) {
      process.stdout.write(renderInfoView(payload));
    } else {
      process.stdout.write(renderInfo(payload));
    }
    return;
  }

  if (command === 'query') {
    if (view && typeof view === 'string' && view.startsWith('svg:')) {
      const svgPath = view.slice(4);
      if (!payload._renderedSvg) {
        process.stderr.write('No graph data — skipping SVG export.\n');
      } else {
        fs.writeFileSync(svgPath, payload._renderedSvg);
        process.stderr.write(`SVG written to ${svgPath}\n`);
      }
    } else if (view && typeof view === 'string' && view.startsWith('html:')) {
      const htmlPath = view.slice(5);
      if (!payload._renderedSvg) {
        process.stderr.write('No graph data — skipping HTML export.\n');
      } else {
        writeHtmlExport(htmlPath, payload._renderedSvg);
        process.stderr.write(`HTML written to ${htmlPath}\n`);
      }
    } else if (view) {
      process.stdout.write(`${payload._renderedAscii}\n`);
    } else {
      process.stdout.write(renderQuery(payload));
    }
    return;
  }

  if (command === 'path') {
    if (view && typeof view === 'string' && view.startsWith('svg:')) {
      const svgPath = view.slice(4);
      if (!payload._renderedSvg) {
        process.stderr.write('No path found — skipping SVG export.\n');
      } else {
        fs.writeFileSync(svgPath, payload._renderedSvg);
        process.stderr.write(`SVG written to ${svgPath}\n`);
      }
    } else if (view && typeof view === 'string' && view.startsWith('html:')) {
      const htmlPath = view.slice(5);
      if (!payload._renderedSvg) {
        process.stderr.write('No path found — skipping HTML export.\n');
      } else {
        writeHtmlExport(htmlPath, payload._renderedSvg);
        process.stderr.write(`HTML written to ${htmlPath}\n`);
      }
    } else if (view) {
      process.stdout.write(renderPathView(payload));
    } else {
      process.stdout.write(renderPath(payload));
    }
    return;
  }

  if (command === 'check') {
    if (view) {
      process.stdout.write(renderCheckView(payload));
    } else {
      process.stdout.write(renderCheck(payload));
    }
    return;
  }

  if (command === 'history') {
    if (view) {
      process.stdout.write(renderHistoryView(payload));
    } else {
      process.stdout.write(renderHistory(payload));
    }
    return;
  }

  if (command === 'materialize') {
    if (view) {
      process.stdout.write(renderMaterializeView(payload));
    } else {
      process.stdout.write(renderMaterialize(payload));
    }
    return;
  }

  if (command === 'seek') {
    if (view) {
      process.stdout.write(renderSeekView(payload));
    } else {
      process.stdout.write(renderSeek(payload));
    }
    return;
  }

  if (command === 'install-hooks') {
    process.stdout.write(renderInstallHooks(payload));
    return;
  }

  if (payload?.error) {
    process.stderr.write(renderError(payload));
    return;
  }

  process.stdout.write(`${stableStringify(payload)}\n`);
}

/**
 * Handles the `info` command: summarizes graphs in the repository.
 * @param {{options: CliOptions}} params
 * @returns {Promise<{repo: string, graphs: GraphInfoResult[]}>} Info payload
 * @throws {CliError} If the specified graph is not found
 */
async function handleInfo({ options }) {
  const { persistence } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (options.graph && !graphNames.includes(options.graph)) {
    throw notFoundError(`Graph not found: ${options.graph}`);
  }

  const detailGraphs = new Set();
  if (options.graph) {
    detailGraphs.add(options.graph);
  } else if (graphNames.length === 1) {
    detailGraphs.add(graphNames[0]);
  }

  // In view mode, include extra data for visualization
  const isViewMode = Boolean(options.view);

  const graphs = [];
  for (const name of graphNames) {
    const includeDetails = detailGraphs.has(name);
    const info = await getGraphInfo(persistence, name, {
      includeWriterIds: includeDetails || isViewMode,
      includeRefs: includeDetails || isViewMode,
      includeWriterPatches: isViewMode,
      includeCheckpointDate: isViewMode,
    });
    const activeCursor = await readActiveCursor(persistence, name);
    if (activeCursor) {
      info.cursor = { active: true, tick: activeCursor.tick, mode: activeCursor.mode };
    } else {
      info.cursor = { active: false };
    }
    graphs.push(info);
  }

  return {
    repo: options.repo,
    graphs,
  };
}

/**
 * Handles the `query` command: runs a logical graph query.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>} Query result payload
 * @throws {CliError} On invalid query options or query execution errors
 */
async function handleQuery({ options, args }) {
  const querySpec = parseQueryArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  let builder = graph.query();

  if (querySpec.match !== null) {
    builder = builder.match(querySpec.match);
  }

  builder = applyQuerySteps(builder, querySpec.steps);

  if (querySpec.select !== null) {
    builder = builder.select(querySpec.select);
  }

  try {
    const result = await builder.run();
    const payload = buildQueryPayload(graphName, result);

    if (options.view) {
      const edges = await graph.getEdges();
      const graphData = queryResultToGraphData(payload, edges);
      const positioned = await layoutGraph(graphData, { type: 'query' });
      if (typeof options.view === 'string' && (options.view.startsWith('svg:') || options.view.startsWith('html:'))) {
        payload._renderedSvg = renderSvg(positioned, { title: `${graphName} query` });
      } else {
        payload._renderedAscii = renderGraphView(positioned, { title: `QUERY: ${graphName}` });
      }
    }

    return {
      payload,
      exitCode: EXIT_CODES.OK,
    };
  } catch (error) {
    throw mapQueryError(error);
  }
}

/**
 * @param {*} builder
 * @param {Array<{type: string, label?: string, key?: string, value?: string}>} steps
 */
function applyQuerySteps(builder, steps) {
  let current = builder;
  for (const step of steps) {
    current = applyQueryStep(current, step);
  }
  return current;
}

/**
 * @param {*} builder
 * @param {{type: string, label?: string, key?: string, value?: string}} step
 */
function applyQueryStep(builder, step) {
  if (step.type === 'outgoing') {
    return builder.outgoing(step.label);
  }
  if (step.type === 'incoming') {
    return builder.incoming(step.label);
  }
  if (step.type === 'where-prop') {
    return builder.where((/** @type {*} */ node) => matchesPropFilter(node, /** @type {string} */ (step.key), /** @type {string} */ (step.value))); // TODO(ts-cleanup): type CLI payload
  }
  return builder;
}

/**
 * @param {*} node
 * @param {string} key
 * @param {string} value
 */
function matchesPropFilter(node, key, value) {
  const props = node.props || {};
  if (!Object.prototype.hasOwnProperty.call(props, key)) {
    return false;
  }
  return String(props[key]) === value;
}

/**
 * @param {string} graphName
 * @param {*} result
 * @returns {{graph: string, stateHash: *, nodes: *, _renderedSvg?: string, _renderedAscii?: string}}
 */
function buildQueryPayload(graphName, result) {
  return {
    graph: graphName,
    stateHash: result.stateHash,
    nodes: result.nodes,
  };
}

/** @param {*} error */
function mapQueryError(error) {
  if (error && error.code && String(error.code).startsWith('E_QUERY')) {
    throw usageError(error.message);
  }
  throw error;
}

/**
 * Handles the `path` command: finds a shortest path between two nodes.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>} Path result payload
 * @throws {CliError} If --from/--to are missing or a node is not found
 */
async function handlePath({ options, args }) {
  const pathOptions = parsePathArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  try {
    const result = await graph.traverse.shortestPath(
      pathOptions.from,
      pathOptions.to,
      {
        dir: pathOptions.dir,
        labelFilter: pathOptions.labelFilter,
        maxDepth: pathOptions.maxDepth,
      }
    );

    const payload = {
      graph: graphName,
      from: pathOptions.from,
      to: pathOptions.to,
      ...result,
    };

    if (options.view && result.found && typeof options.view === 'string' && (options.view.startsWith('svg:') || options.view.startsWith('html:'))) {
      const graphData = pathResultToGraphData(payload);
      const positioned = await layoutGraph(graphData, { type: 'path' });
      payload._renderedSvg = renderSvg(positioned, { title: `${graphName} path` });
    }

    return {
      payload,
      exitCode: result.found ? EXIT_CODES.OK : EXIT_CODES.NOT_FOUND,
    };
  } catch (/** @type {*} */ error) { // TODO(ts-cleanup): type error
    if (error && error.code === 'NODE_NOT_FOUND') {
      throw notFoundError(error.message);
    }
    throw error;
  }
}

/**
 * Handles the `check` command: reports graph health, GC, and hook status.
 * @param {{options: CliOptions}} params
 * @returns {Promise<{payload: *, exitCode: number}>} Health check payload
 */
async function handleCheck({ options }) {
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  const health = await getHealth(persistence);
  const gcMetrics = await getGcMetrics(graph);
  const status = await graph.status();
  const writerHeads = await collectWriterHeads(graph);
  const checkpoint = await loadCheckpointInfo(persistence, graphName);
  const coverage = await loadCoverageInfo(persistence, graphName, writerHeads);
  const hook = getHookStatusForCheck(options.repo);

  return {
    payload: buildCheckPayload({
      repo: options.repo,
      graphName,
      health,
      checkpoint,
      writerHeads,
      coverage,
      gcMetrics,
      hook,
      status,
    }),
    exitCode: EXIT_CODES.OK,
  };
}

/** @param {Persistence} persistence */
async function getHealth(persistence) {
  const clock = ClockAdapter.node();
  const healthService = new HealthCheckService({ persistence: /** @type {*} */ (persistence), clock }); // TODO(ts-cleanup): narrow port type
  return await healthService.getHealth();
}

/** @param {WarpGraphInstance} graph */
async function getGcMetrics(graph) {
  await graph.materialize();
  return graph.getGCMetrics();
}

/** @param {WarpGraphInstance} graph */
async function collectWriterHeads(graph) {
  const frontier = await graph.getFrontier();
  return [...frontier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([writerId, sha]) => ({ writerId, sha }));
}

/**
 * @param {Persistence} persistence
 * @param {string} graphName
 */
async function loadCheckpointInfo(persistence, graphName) {
  const checkpointRef = buildCheckpointRef(graphName);
  const checkpointSha = await persistence.readRef(checkpointRef);
  const checkpointDate = await readCheckpointDate(persistence, checkpointSha);
  const checkpointAgeSeconds = computeAgeSeconds(checkpointDate);

  return {
    ref: checkpointRef,
    sha: checkpointSha || null,
    date: checkpointDate,
    ageSeconds: checkpointAgeSeconds,
  };
}

/**
 * @param {Persistence} persistence
 * @param {string|null} checkpointSha
 */
async function readCheckpointDate(persistence, checkpointSha) {
  if (!checkpointSha) {
    return null;
  }
  const info = await persistence.getNodeInfo(checkpointSha);
  return info.date || null;
}

/** @param {string|null} checkpointDate */
function computeAgeSeconds(checkpointDate) {
  if (!checkpointDate) {
    return null;
  }
  const parsed = Date.parse(checkpointDate);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000));
}

/**
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {Array<{writerId: string, sha: string}>} writerHeads
 */
async function loadCoverageInfo(persistence, graphName, writerHeads) {
  const coverageRef = buildCoverageRef(graphName);
  const coverageSha = await persistence.readRef(coverageRef);
  const missingWriters = coverageSha
    ? await findMissingWriters(persistence, writerHeads, coverageSha)
    : [];

  return {
    ref: coverageRef,
    sha: coverageSha || null,
    missingWriters: missingWriters.sort(),
  };
}

/**
 * @param {Persistence} persistence
 * @param {Array<{writerId: string, sha: string}>} writerHeads
 * @param {string} coverageSha
 */
async function findMissingWriters(persistence, writerHeads, coverageSha) {
  const missing = [];
  for (const head of writerHeads) {
    const reachable = await persistence.isAncestor(head.sha, coverageSha);
    if (!reachable) {
      missing.push(head.writerId);
    }
  }
  return missing;
}

/**
 * @param {{repo: string, graphName: string, health: *, checkpoint: *, writerHeads: Array<{writerId: string, sha: string}>, coverage: *, gcMetrics: *, hook: *|null, status: *|null}} params
 */
function buildCheckPayload({
  repo,
  graphName,
  health,
  checkpoint,
  writerHeads,
  coverage,
  gcMetrics,
  hook,
  status,
}) {
  return {
    repo,
    graph: graphName,
    health,
    checkpoint,
    writers: {
      count: writerHeads.length,
      heads: writerHeads,
    },
    coverage,
    gc: gcMetrics,
    hook: hook || null,
    status: status || null,
  };
}

/**
 * Handles the `history` command: shows patch history for a writer.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>} History payload
 * @throws {CliError} If no patches are found for the writer
 */
async function handleHistory({ options, args }) {
  const historyOptions = parseHistoryArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);

  const writerId = options.writer;
  let patches = await graph.getWriterPatches(writerId);
  if (cursorInfo.active) {
    patches = patches.filter((/** @type {*} */ { patch }) => patch.lamport <= /** @type {number} */ (cursorInfo.tick)); // TODO(ts-cleanup): type CLI payload
  }
  if (patches.length === 0) {
    throw notFoundError(`No patches found for writer: ${writerId}`);
  }

  const entries = patches
    .filter((/** @type {*} */ { patch }) => !historyOptions.node || patchTouchesNode(patch, historyOptions.node)) // TODO(ts-cleanup): type CLI payload
    .map((/** @type {*} */ { patch, sha }) => ({ // TODO(ts-cleanup): type CLI payload
      sha,
      schema: patch.schema,
      lamport: patch.lamport,
      opCount: Array.isArray(patch.ops) ? patch.ops.length : 0,
      opSummary: Array.isArray(patch.ops) ? summarizeOps(patch.ops) : undefined,
    }));

  const payload = {
    graph: graphName,
    writer: writerId,
    nodeFilter: historyOptions.node,
    entries,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

/**
 * Materializes a single graph, creates a checkpoint, and returns summary stats.
 * When a ceiling tick is provided (seek cursor active), the checkpoint step is
 * skipped because the user is exploring historical state, not persisting it.
 * @param {{persistence: Persistence, graphName: string, writerId: string, ceiling?: number}} params
 * @returns {Promise<{graph: string, nodes: number, edges: number, properties: number, checkpoint: string|null, writers: Record<string, number>, patchCount: number}>}
 */
async function materializeOneGraph({ persistence, graphName, writerId, ceiling }) {
  const graph = await WarpGraph.open({ persistence, graphName, writerId, crypto: new NodeCryptoAdapter() });
  await graph.materialize(ceiling !== undefined ? { ceiling } : undefined);
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  const checkpoint = ceiling !== undefined ? null : await graph.createCheckpoint();
  const status = await graph.status();

  // Build per-writer patch counts for the view renderer
  /** @type {Record<string, number>} */
  const writers = {};
  let totalPatchCount = 0;
  for (const wId of Object.keys(status.frontier)) {
    const patches = await graph.getWriterPatches(wId);
    writers[wId] = patches.length;
    totalPatchCount += patches.length;
  }

  const properties = await graph.getPropertyCount();

  return {
    graph: graphName,
    nodes: nodes.length,
    edges: edges.length,
    properties,
    checkpoint,
    writers,
    patchCount: totalPatchCount,
  };
}

/**
 * Handles the `materialize` command: materializes and checkpoints all graphs.
 * @param {{options: CliOptions}} params
 * @returns {Promise<{payload: *, exitCode: number}>} Materialize result payload
 * @throws {CliError} If the specified graph is not found
 */
async function handleMaterialize({ options }) {
  const { persistence } = await createPersistence(options.repo);
  const graphNames = await listGraphNames(persistence);

  if (graphNames.length === 0) {
    return {
      payload: { graphs: [] },
      exitCode: EXIT_CODES.OK,
    };
  }

  const targets = options.graph
    ? [options.graph]
    : graphNames;

  if (options.graph && !graphNames.includes(options.graph)) {
    throw notFoundError(`Graph not found: ${options.graph}`);
  }

  const results = [];
  let cursorWarningEmitted = false;
  for (const name of targets) {
    try {
      const cursor = await readActiveCursor(persistence, name);
      const ceiling = cursor ? cursor.tick : undefined;
      if (cursor && !cursorWarningEmitted) {
        emitCursorWarning({ active: true, tick: cursor.tick, maxTick: null }, null);
        cursorWarningEmitted = true;
      }
      const result = await materializeOneGraph({
        persistence,
        graphName: name,
        writerId: options.writer,
        ceiling,
      });
      results.push(result);
    } catch (error) {
      results.push({
        graph: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allFailed = results.every((r) => /** @type {*} */ (r).error); // TODO(ts-cleanup): type CLI payload
  return {
    payload: { graphs: results },
    exitCode: allFailed ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}

/** @param {*} payload */
function renderMaterialize(payload) {
  if (payload.graphs.length === 0) {
    return 'No graphs found in repo.\n';
  }

  const lines = [];
  for (const entry of payload.graphs) {
    if (entry.error) {
      lines.push(`${entry.graph}: error — ${entry.error}`);
    } else {
      lines.push(`${entry.graph}: ${entry.nodes} nodes, ${entry.edges} edges, checkpoint ${entry.checkpoint}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

/** @param {*} payload */
function renderInstallHooks(payload) {
  if (payload.action === 'up-to-date') {
    return `Hook: already up to date (v${payload.version}) at ${payload.hookPath}\n`;
  }
  if (payload.action === 'skipped') {
    return 'Hook: installation skipped\n';
  }
  const lines = [`Hook: ${payload.action} (v${payload.version})`, `Path: ${payload.hookPath}`];
  if (payload.backupPath) {
    lines.push(`Backup: ${payload.backupPath}`);
  }
  return `${lines.join('\n')}\n`;
}

function createHookInstaller() {
  const __filename = new URL(import.meta.url).pathname;
  const __dirname = path.dirname(__filename);
  const templateDir = path.resolve(__dirname, '..', 'hooks');
  const { version } = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
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
function execGitConfigValue(repoPath, key) {
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

function isInteractive() {
  return Boolean(process.stderr.isTTY);
}

/** @param {string} question @returns {Promise<string>} */
function promptUser(question) {
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

/** @param {string[]} args */
function parseInstallHooksArgs(args) {
  const options = { force: false };
  for (const arg of args) {
    if (arg === '--force') {
      options.force = true;
    } else if (arg.startsWith('-')) {
      throw usageError(`Unknown install-hooks option: ${arg}`);
    }
  }
  return options;
}

/**
 * @param {*} classification
 * @param {{force: boolean}} hookOptions
 */
async function resolveStrategy(classification, hookOptions) {
  if (hookOptions.force) {
    return 'replace';
  }

  if (classification.kind === 'none') {
    return 'install';
  }

  if (classification.kind === 'ours') {
    return await promptForOursStrategy(classification);
  }

  return await promptForForeignStrategy();
}

/** @param {*} classification */
async function promptForOursStrategy(classification) {
  const installer = createHookInstaller();
  if (classification.version === installer._version) {
    return 'up-to-date';
  }

  if (!isInteractive()) {
    throw usageError('Existing hook found. Use --force or run interactively.');
  }

  const answer = await promptUser(
    `Upgrade hook from v${classification.version} to v${installer._version}? [Y/n] `,
  );
  if (answer === '' || answer.toLowerCase() === 'y') {
    return 'upgrade';
  }
  return 'skip';
}

async function promptForForeignStrategy() {
  if (!isInteractive()) {
    throw usageError('Existing hook found. Use --force or run interactively.');
  }

  process.stderr.write('Existing post-merge hook found.\n');
  process.stderr.write('  1) Append (keep existing hook, add warp section)\n');
  process.stderr.write('  2) Replace (back up existing, install fresh)\n');
  process.stderr.write('  3) Skip\n');
  const answer = await promptUser('Choose [1-3]: ');

  if (answer === '1') {
    return 'append';
  }
  if (answer === '2') {
    return 'replace';
  }
  return 'skip';
}

/**
 * Handles the `install-hooks` command: installs or upgrades the post-merge git hook.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>} Install result payload
 * @throws {CliError} If an existing hook is found and the session is not interactive
 */
async function handleInstallHooks({ options, args }) {
  const hookOptions = parseInstallHooksArgs(args);
  const installer = createHookInstaller();
  const status = installer.getHookStatus(options.repo);
  const content = readHookContent(status.hookPath);
  const classification = classifyExistingHook(content);
  const strategy = await resolveStrategy(classification, hookOptions);

  if (strategy === 'up-to-date') {
    return {
      payload: {
        action: 'up-to-date',
        hookPath: status.hookPath,
        version: installer._version,
      },
      exitCode: EXIT_CODES.OK,
    };
  }

  if (strategy === 'skip') {
    return {
      payload: { action: 'skipped' },
      exitCode: EXIT_CODES.OK,
    };
  }

  const result = installer.install(options.repo, { strategy });
  return {
    payload: result,
    exitCode: EXIT_CODES.OK,
  };
}

/** @param {string} hookPath */
function readHookContent(hookPath) {
  try {
    return fs.readFileSync(hookPath, 'utf8');
  } catch {
    return null;
  }
}

/** @param {string} repoPath */
function getHookStatusForCheck(repoPath) {
  try {
    const installer = createHookInstaller();
    return installer.getHookStatus(repoPath);
  } catch {
    return null;
  }
}

// ============================================================================
// Cursor I/O Helpers
// ============================================================================

/**
 * Reads the active seek cursor for a graph from Git ref storage.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @returns {Promise<CursorBlob|null>} Cursor object, or null if no active cursor
 * @throws {Error} If the stored blob is corrupted or not valid JSON
 */
async function readActiveCursor(persistence, graphName) {
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
 * Serializes the cursor as JSON, stores it as a Git blob, and points
 * the active cursor ref at that blob.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @param {CursorBlob} cursor - Cursor state to persist
 * @returns {Promise<void>}
 */
async function writeActiveCursor(persistence, graphName, cursor) {
  const ref = buildCursorActiveRef(graphName);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(Buffer.from(json, 'utf8'));
  await persistence.updateRef(ref, oid);
}

/**
 * Removes the active seek cursor for a graph, returning to present state.
 *
 * No-op if no active cursor exists.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @returns {Promise<void>}
 */
async function clearActiveCursor(persistence, graphName) {
  const ref = buildCursorActiveRef(graphName);
  const exists = await persistence.readRef(ref);
  if (exists) {
    await persistence.deleteRef(ref);
  }
}

/**
 * Reads a named saved cursor from Git ref storage.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @param {string} name - Saved cursor name
 * @returns {Promise<CursorBlob|null>} Cursor object, or null if not found
 * @throws {Error} If the stored blob is corrupted or not valid JSON
 */
async function readSavedCursor(persistence, graphName, name) {
  const ref = buildCursorSavedRef(graphName, name);
  const oid = await persistence.readRef(ref);
  if (!oid) {
    return null;
  }
  const buf = await persistence.readBlob(oid);
  return parseCursorBlob(buf, `saved cursor '${name}'`);
}

/**
 * Persists a cursor under a named saved-cursor ref.
 *
 * Serializes the cursor as JSON, stores it as a Git blob, and points
 * the named saved-cursor ref at that blob.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @param {string} name - Saved cursor name
 * @param {CursorBlob} cursor - Cursor state to persist
 * @returns {Promise<void>}
 */
async function writeSavedCursor(persistence, graphName, name, cursor) {
  const ref = buildCursorSavedRef(graphName, name);
  const json = JSON.stringify(cursor);
  const oid = await persistence.writeBlob(Buffer.from(json, 'utf8'));
  await persistence.updateRef(ref, oid);
}

/**
 * Deletes a named saved cursor from Git ref storage.
 *
 * No-op if the named cursor does not exist.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @param {string} name - Saved cursor name to delete
 * @returns {Promise<void>}
 */
async function deleteSavedCursor(persistence, graphName, name) {
  const ref = buildCursorSavedRef(graphName, name);
  const exists = await persistence.readRef(ref);
  if (exists) {
    await persistence.deleteRef(ref);
  }
}

/**
 * Lists all saved cursors for a graph, reading each blob to include full cursor state.
 *
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @returns {Promise<Array<{name: string, tick: number, mode?: string}>>} Array of saved cursors with their names
 * @throws {Error} If any stored blob is corrupted or not valid JSON
 */
async function listSavedCursors(persistence, graphName) {
  const prefix = buildCursorSavedPrefix(graphName);
  const refs = await persistence.listRefs(prefix);
  const cursors = [];
  for (const ref of refs) {
    const name = ref.slice(prefix.length);
    if (name) {
      const oid = await persistence.readRef(ref);
      if (oid) {
        const buf = await persistence.readBlob(oid);
        const cursor = parseCursorBlob(buf, `saved cursor '${name}'`);
        cursors.push({ name, ...cursor });
      }
    }
  }
  return cursors;
}

// ============================================================================
// Seek Arg Parser
// ============================================================================

/**
 * @param {string} arg
 * @param {SeekSpec} spec
 */
function handleSeekBooleanFlag(arg, spec) {
  if (arg === '--clear-cache') {
    if (spec.action !== 'status') {
      throw usageError('--clear-cache cannot be combined with other seek flags');
    }
    spec.action = 'clear-cache';
  } else if (arg === '--no-persistent-cache') {
    spec.noPersistentCache = true;
  } else if (arg === '--diff') {
    spec.diff = true;
  }
}

/**
 * Parses --diff-limit / --diff-limit=N into the seek spec.
 * @param {string} arg
 * @param {string[]} args
 * @param {number} i
 * @param {SeekSpec} spec
 */
function handleDiffLimitFlag(arg, args, i, spec) {
  let raw;
  if (arg.startsWith('--diff-limit=')) {
    raw = arg.slice('--diff-limit='.length);
  } else {
    raw = args[i + 1];
    if (raw === undefined) {
      throw usageError('Missing value for --diff-limit');
    }
  }
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) {
    throw usageError(`Invalid --diff-limit value: ${raw}. Must be a positive integer.`);
  }
  spec.diffLimit = n;
}

/**
 * Parses a named action flag (--save, --load, --drop) with its value.
 * @param {string} flagName - e.g. 'save'
 * @param {string} arg - Current arg token
 * @param {string[]} args - All args
 * @param {number} i - Current index
 * @param {SeekSpec} spec
 * @returns {number} Number of extra args consumed (0 or 1)
 */
function parseSeekNamedAction(flagName, arg, args, i, spec) {
  if (spec.action !== 'status') {
    throw usageError(`--${flagName} cannot be combined with other seek flags`);
  }
  spec.action = flagName;
  if (arg === `--${flagName}`) {
    const val = args[i + 1];
    if (val === undefined || val.startsWith('-')) {
      throw usageError(`Missing name for --${flagName}`);
    }
    spec.name = val;
    return 1;
  }
  spec.name = arg.slice(`--${flagName}=`.length);
  if (!spec.name) {
    throw usageError(`Missing name for --${flagName}`);
  }
  return 0;
}

/**
 * Parses CLI arguments for the `seek` command into a structured spec.
 * @param {string[]} args - Raw CLI arguments following the `seek` subcommand
 * @returns {SeekSpec} Parsed spec
 */
function parseSeekArgs(args) {
  /** @type {SeekSpec} */
  const spec = {
    action: 'status', // status, tick, latest, save, load, list, drop, clear-cache
    tickValue: null,
    name: null,
    noPersistentCache: false,
    diff: false,
    diffLimit: 2000,
  };
  let diffLimitProvided = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--tick') {
      if (spec.action !== 'status') {
        throw usageError('--tick cannot be combined with other seek flags');
      }
      spec.action = 'tick';
      const val = args[i + 1];
      if (val === undefined) {
        throw usageError('Missing value for --tick');
      }
      spec.tickValue = val;
      i += 1;
    } else if (arg.startsWith('--tick=')) {
      if (spec.action !== 'status') {
        throw usageError('--tick cannot be combined with other seek flags');
      }
      spec.action = 'tick';
      spec.tickValue = arg.slice('--tick='.length);
    } else if (arg === '--latest') {
      if (spec.action !== 'status') {
        throw usageError('--latest cannot be combined with other seek flags');
      }
      spec.action = 'latest';
    } else if (arg === '--save' || arg.startsWith('--save=')) {
      i += parseSeekNamedAction('save', arg, args, i, spec);
    } else if (arg === '--load' || arg.startsWith('--load=')) {
      i += parseSeekNamedAction('load', arg, args, i, spec);
    } else if (arg === '--list') {
      if (spec.action !== 'status') {
        throw usageError('--list cannot be combined with other seek flags');
      }
      spec.action = 'list';
    } else if (arg === '--drop' || arg.startsWith('--drop=')) {
      i += parseSeekNamedAction('drop', arg, args, i, spec);
    } else if (arg === '--clear-cache' || arg === '--no-persistent-cache' || arg === '--diff') {
      handleSeekBooleanFlag(arg, spec);
    } else if (arg === '--diff-limit' || arg.startsWith('--diff-limit=')) {
      handleDiffLimitFlag(arg, args, i, spec);
      diffLimitProvided = true;
      if (arg === '--diff-limit') {
        i += 1;
      }
    } else if (arg.startsWith('-')) {
      throw usageError(`Unknown seek option: ${arg}`);
    }
  }

  // --diff is only meaningful for actions that navigate to a tick
  const DIFF_ACTIONS = new Set(['tick', 'latest', 'load']);
  if (spec.diff && !DIFF_ACTIONS.has(spec.action)) {
    throw usageError(`--diff cannot be used with --${spec.action}`);
  }
  if (diffLimitProvided && !spec.diff) {
    throw usageError('--diff-limit requires --diff');
  }

  return spec;
}

/**
 * Resolves a tick value (absolute or relative +N/-N) against available ticks.
 *
 * For relative values, steps through the sorted tick array (with 0 prepended
 * as a virtual "empty state" position) by the given delta from the current
 * position. For absolute values, clamps to maxTick.
 *
 * @private
 * @param {string} tickValue - Raw tick string from CLI args (e.g. "5", "+1", "-2")
 * @param {number|null} currentTick - Current cursor tick, or null if no active cursor
 * @param {number[]} ticks - Sorted ascending array of available Lamport ticks
 * @param {number} maxTick - Maximum tick across all writers
 * @returns {number} Resolved tick value (clamped to valid range)
 * @throws {CliError} If tickValue is not a valid integer or relative delta
 */
function resolveTickValue(tickValue, currentTick, ticks, maxTick) {
  // Relative: +N or -N
  if (tickValue.startsWith('+') || tickValue.startsWith('-')) {
    const delta = parseInt(tickValue, 10);
    if (!Number.isInteger(delta)) {
      throw usageError(`Invalid tick delta: ${tickValue}`);
    }
    const base = currentTick ?? 0;

    // Find the current position in sorted ticks, then step by delta
    // Include tick 0 as a virtual "empty state" position (avoid duplicating if already present)
    const allPoints = (ticks.length > 0 && ticks[0] === 0) ? [...ticks] : [0, ...ticks];
    const currentIdx = allPoints.indexOf(base);
    const startIdx = currentIdx === -1 ? 0 : currentIdx;
    const targetIdx = Math.max(0, Math.min(allPoints.length - 1, startIdx + delta));
    return allPoints[targetIdx];
  }

  // Absolute
  const n = parseInt(tickValue, 10);
  if (!Number.isInteger(n) || n < 0) {
    throw usageError(`Invalid tick value: ${tickValue}. Must be a non-negative integer, or +N/-N for relative.`);
  }

  // Clamp to maxTick
  return Math.min(n, maxTick);
}

// ============================================================================
// Seek Handler
// ============================================================================

/**
 * @param {WarpGraphInstance} graph
 * @param {Persistence} persistence
 * @param {string} graphName
 * @param {SeekSpec} seekSpec
 */
function wireSeekCache(graph, persistence, graphName, seekSpec) {
  if (seekSpec.noPersistentCache) {
    return;
  }
  graph.setSeekCache(new CasSeekCacheAdapter({
    persistence,
    plumbing: persistence.plumbing,
    graphName,
  }));
}

/**
 * Handles the `git warp seek` command across all sub-actions.
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
async function handleSeek({ options, args }) {
  const seekSpec = parseSeekArgs(args);
  const { graph, graphName, persistence } = await openGraph(options);
  void wireSeekCache(graph, persistence, graphName, seekSpec);

  // Handle --clear-cache before discovering ticks (no materialization needed)
  if (seekSpec.action === 'clear-cache') {
    if (graph.seekCache) {
      await graph.seekCache.clear();
    }
    return {
      payload: { graph: graphName, action: 'clear-cache', message: 'Seek cache cleared.' },
      exitCode: EXIT_CODES.OK,
    };
  }

  const activeCursor = await readActiveCursor(persistence, graphName);
  const { ticks, maxTick, perWriter } = await graph.discoverTicks();
  const frontierHash = computeFrontierHash(perWriter);
  if (seekSpec.action === 'list') {
    const saved = await listSavedCursors(persistence, graphName);
    return {
      payload: {
        graph: graphName,
        action: 'list',
        cursors: saved,
        activeTick: activeCursor ? activeCursor.tick : null,
        maxTick,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'drop') {
    const dropName = /** @type {string} */ (seekSpec.name);
    const existing = await readSavedCursor(persistence, graphName, dropName);
    if (!existing) {
      throw notFoundError(`Saved cursor not found: ${dropName}`);
    }
    await deleteSavedCursor(persistence, graphName, dropName);
    return {
      payload: {
        graph: graphName,
        action: 'drop',
        name: seekSpec.name,
        tick: existing.tick,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'latest') {
    const prevTick = activeCursor ? activeCursor.tick : null;
    let sdResult = null;
    if (seekSpec.diff) {
      sdResult = await computeStructuralDiff({ graph, prevTick, currentTick: maxTick, diffLimit: seekSpec.diffLimit });
    }
    await clearActiveCursor(persistence, graphName);
    // When --diff already materialized at maxTick, skip redundant re-materialize
    if (!sdResult) {
      await graph.materialize({ ceiling: maxTick });
    }
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: maxTick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'latest',
        tick: maxTick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(maxTick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: false },
        ...sdResult,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'save') {
    if (!activeCursor) {
      throw usageError('No active cursor to save. Use --tick first.');
    }
    await writeSavedCursor(persistence, graphName, /** @type {string} */ (seekSpec.name), activeCursor);
    return {
      payload: {
        graph: graphName,
        action: 'save',
        name: seekSpec.name,
        tick: activeCursor.tick,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'load') {
    const loadName = /** @type {string} */ (seekSpec.name);
    const saved = await readSavedCursor(persistence, graphName, loadName);
    if (!saved) {
      throw notFoundError(`Saved cursor not found: ${loadName}`);
    }
    const prevTick = activeCursor ? activeCursor.tick : null;
    let sdResult = null;
    if (seekSpec.diff) {
      sdResult = await computeStructuralDiff({ graph, prevTick, currentTick: saved.tick, diffLimit: seekSpec.diffLimit });
    }
    // When --diff already materialized at saved.tick, skip redundant call
    if (!sdResult) {
      await graph.materialize({ ceiling: saved.tick });
    }
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    await writeActiveCursor(persistence, graphName, { tick: saved.tick, mode: saved.mode ?? 'lamport', nodes: nodes.length, edges: edges.length, frontierHash });
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: saved.tick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'load',
        name: seekSpec.name,
        tick: saved.tick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(saved.tick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: true, mode: saved.mode, tick: saved.tick, maxTick, name: seekSpec.name },
        ...sdResult,
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  if (seekSpec.action === 'tick') {
    const currentTick = activeCursor ? activeCursor.tick : null;
    const resolvedTick = resolveTickValue(/** @type {string} */ (seekSpec.tickValue), currentTick, ticks, maxTick);
    let sdResult = null;
    if (seekSpec.diff) {
      sdResult = await computeStructuralDiff({ graph, prevTick: currentTick, currentTick: resolvedTick, diffLimit: seekSpec.diffLimit });
    }
    // When --diff already materialized at resolvedTick, skip redundant call
    if (!sdResult) {
      await graph.materialize({ ceiling: resolvedTick });
    }
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    await writeActiveCursor(persistence, graphName, { tick: resolvedTick, mode: 'lamport', nodes: nodes.length, edges: edges.length, frontierHash });
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: resolvedTick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'tick',
        tick: resolvedTick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(resolvedTick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: true, mode: 'lamport', tick: resolvedTick, maxTick, name: 'active' },
        ...sdResult,
      },
      exitCode: EXIT_CODES.OK,
    };
  }

  // status (bare seek)
  return await handleSeekStatus({ graph, graphName, persistence, activeCursor, ticks, maxTick, perWriter, frontierHash });
}

/**
 * Handles the `status` sub-action of `seek` (bare seek with no action flag).
 * @param {{graph: WarpGraphInstance, graphName: string, persistence: Persistence, activeCursor: CursorBlob|null, ticks: number[], maxTick: number, perWriter: Map<string, WriterTickInfo>, frontierHash: string}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
async function handleSeekStatus({ graph, graphName, persistence, activeCursor, ticks, maxTick, perWriter, frontierHash }) {
  if (activeCursor) {
    await graph.materialize({ ceiling: activeCursor.tick });
    const nodes = await graph.getNodes();
    const edges = await graph.getEdges();
    const prevCounts = readSeekCounts(activeCursor);
    const prevFrontierHash = typeof activeCursor.frontierHash === 'string' ? activeCursor.frontierHash : null;
    if (prevCounts.nodes === null || prevCounts.edges === null || prevCounts.nodes !== nodes.length || prevCounts.edges !== edges.length || prevFrontierHash !== frontierHash) {
      await writeActiveCursor(persistence, graphName, { tick: activeCursor.tick, mode: activeCursor.mode ?? 'lamport', nodes: nodes.length, edges: edges.length, frontierHash });
    }
    const diff = computeSeekStateDiff(activeCursor, { nodes: nodes.length, edges: edges.length }, frontierHash);
    const tickReceipt = await buildTickReceipt({ tick: activeCursor.tick, perWriter, graph });
    return {
      payload: {
        graph: graphName,
        action: 'status',
        tick: activeCursor.tick,
        maxTick,
        ticks,
        nodes: nodes.length,
        edges: edges.length,
        perWriter: serializePerWriter(perWriter),
        patchCount: countPatchesAtTick(activeCursor.tick, perWriter),
        diff,
        tickReceipt,
        cursor: { active: true, mode: activeCursor.mode, tick: activeCursor.tick, maxTick, name: 'active' },
      },
      exitCode: EXIT_CODES.OK,
    };
  }
  await graph.materialize();
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  const tickReceipt = await buildTickReceipt({ tick: maxTick, perWriter, graph });
  return {
    payload: {
      graph: graphName,
      action: 'status',
      tick: maxTick,
      maxTick,
      ticks,
      nodes: nodes.length,
      edges: edges.length,
      perWriter: serializePerWriter(perWriter),
      patchCount: countPatchesAtTick(maxTick, perWriter),
      diff: null,
      tickReceipt,
      cursor: { active: false },
    },
    exitCode: EXIT_CODES.OK,
  };
}

/**
 * Converts the per-writer Map from discoverTicks() into a plain object for JSON output.
 *
 * @param {Map<string, WriterTickInfo>} perWriter - Per-writer tick data
 * @returns {Record<string, WriterTickInfo>} Plain object keyed by writer ID
 */
function serializePerWriter(perWriter) {
  /** @type {Record<string, WriterTickInfo>} */
  const result = {};
  for (const [writerId, info] of perWriter) {
    result[writerId] = { ticks: info.ticks, tipSha: info.tipSha, tickShas: info.tickShas };
  }
  return result;
}

/**
 * Counts the total number of patches across all writers at or before the given tick.
 *
 * @param {number} tick - Lamport tick ceiling (inclusive)
 * @param {Map<string, WriterTickInfo>} perWriter - Per-writer tick data
 * @returns {number} Total patch count at or before the given tick
 */
function countPatchesAtTick(tick, perWriter) {
  let count = 0;
  for (const [, info] of perWriter) {
    for (const t of info.ticks) {
      if (t <= tick) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Computes a stable fingerprint of the current graph frontier (writer tips).
 *
 * Used to suppress seek diffs when graph history may have changed since the
 * previous cursor snapshot (e.g. new writers/patches, rewritten refs).
 *
 * @param {Map<string, WriterTickInfo>} perWriter - Per-writer metadata from discoverTicks()
 * @returns {string} Hex digest of the frontier fingerprint
 */
function computeFrontierHash(perWriter) {
  /** @type {Record<string, string|null>} */
  const tips = {};
  for (const [writerId, info] of perWriter) {
    tips[writerId] = info?.tipSha || null;
  }
  return crypto.createHash('sha256').update(stableStringify(tips)).digest('hex');
}

/**
 * Reads cached seek state counts from a cursor blob.
 *
 * Counts may be missing for older cursors (pre-diff support). In that case
 * callers should treat the counts as unknown and suppress diffs.
 *
 * @param {CursorBlob|null} cursor - Parsed cursor blob object
 * @returns {{nodes: number|null, edges: number|null}} Parsed counts
 */
function readSeekCounts(cursor) {
  if (!cursor || typeof cursor !== 'object') {
    return { nodes: null, edges: null };
  }

  const nodes = typeof cursor.nodes === 'number' && Number.isFinite(cursor.nodes) ? cursor.nodes : null;
  const edges = typeof cursor.edges === 'number' && Number.isFinite(cursor.edges) ? cursor.edges : null;
  return { nodes, edges };
}

/**
 * Computes node/edge deltas between the current seek position and the previous cursor.
 *
 * Returns null if the previous cursor is missing cached counts.
 *
 * @param {CursorBlob|null} prevCursor - Cursor object read before updating the position
 * @param {{nodes: number, edges: number}} next - Current materialized counts
 * @param {string} frontierHash - Frontier fingerprint of the current graph
 * @returns {{nodes: number, edges: number}|null} Diff object or null when unknown
 */
function computeSeekStateDiff(prevCursor, next, frontierHash) {
  const prev = readSeekCounts(prevCursor);
  if (prev.nodes === null || prev.edges === null) {
    return null;
  }
  const prevFrontierHash = typeof prevCursor?.frontierHash === 'string' ? prevCursor.frontierHash : null;
  if (!prevFrontierHash || prevFrontierHash !== frontierHash) {
    return null;
  }
  return {
    nodes: next.nodes - prev.nodes,
    edges: next.edges - prev.edges,
  };
}

/**
 * Builds a per-writer operation summary for patches at an exact tick.
 *
 * Uses discoverTicks() tickShas mapping to locate patch SHAs, then loads and
 * summarizes patch ops. Typically only a handful of writers have a patch at any
 * single Lamport tick.
 *
 * @param {{tick: number, perWriter: Map<string, WriterTickInfo>, graph: WarpGraphInstance}} params
 * @returns {Promise<Record<string, {sha: string, opSummary: *}>|null>} Map of writerId to { sha, opSummary }, or null if empty
 */
async function buildTickReceipt({ tick, perWriter, graph }) {
  if (!Number.isInteger(tick) || tick <= 0) {
    return null;
  }

  /** @type {Record<string, {sha: string, opSummary: *}>} */
  const receipt = {};

  for (const [writerId, info] of perWriter) {
    const sha = /** @type {*} */ (info?.tickShas)?.[tick]; // TODO(ts-cleanup): type CLI payload
    if (!sha) {
      continue;
    }

    const patch = await graph.loadPatchBySha(sha);
    const ops = Array.isArray(patch?.ops) ? patch.ops : [];
    receipt[writerId] = { sha, opSummary: summarizeOps(ops) };
  }

  return Object.keys(receipt).length > 0 ? receipt : null;
}

/**
 * Computes a structural diff between the state at a previous tick and
 * the state at the current tick.
 *
 * Materializes the baseline tick first, snapshots the state, then
 * materializes the target tick and calls diffStates() between the two.
 * Applies diffLimit truncation when the total change count exceeds the cap.
 *
 * @param {{graph: WarpGraphInstance, prevTick: number|null, currentTick: number, diffLimit: number}} params
 * @returns {Promise<{structuralDiff: *, diffBaseline: string, baselineTick: number|null, truncated: boolean, totalChanges: number, shownChanges: number}>}
 */
async function computeStructuralDiff({ graph, prevTick, currentTick, diffLimit }) {
  let beforeState = null;
  let diffBaseline = 'empty';
  let baselineTick = null;

  // Short-circuit: same tick produces an empty diff
  if (prevTick !== null && prevTick === currentTick) {
    const empty = { nodes: { added: [], removed: [] }, edges: { added: [], removed: [] }, props: { set: [], removed: [] } };
    return { structuralDiff: empty, diffBaseline: 'tick', baselineTick: prevTick, truncated: false, totalChanges: 0, shownChanges: 0 };
  }

  if (prevTick !== null && prevTick > 0) {
    await graph.materialize({ ceiling: prevTick });
    beforeState = await graph.getStateSnapshot();
    diffBaseline = 'tick';
    baselineTick = prevTick;
  }

  await graph.materialize({ ceiling: currentTick });
  const afterState = /** @type {*} */ (await graph.getStateSnapshot()); // TODO(ts-cleanup): narrow WarpStateV5
  const diff = diffStates(beforeState, afterState);

  return applyDiffLimit(diff, diffBaseline, baselineTick, diffLimit);
}

/**
 * Applies truncation limits to a structural diff result.
 *
 * @param {*} diff
 * @param {string} diffBaseline
 * @param {number|null} baselineTick
 * @param {number} diffLimit
 * @returns {{structuralDiff: *, diffBaseline: string, baselineTick: number|null, truncated: boolean, totalChanges: number, shownChanges: number}}
 */
function applyDiffLimit(diff, diffBaseline, baselineTick, diffLimit) {
  const totalChanges =
    diff.nodes.added.length + diff.nodes.removed.length +
    diff.edges.added.length + diff.edges.removed.length +
    diff.props.set.length + diff.props.removed.length;

  if (totalChanges <= diffLimit) {
    return { structuralDiff: diff, diffBaseline, baselineTick, truncated: false, totalChanges, shownChanges: totalChanges };
  }

  // Truncate sequentially (nodes → edges → props), keeping sort order within each category
  let remaining = diffLimit;
  const cap = (/** @type {any[]} */ arr) => {
    const take = Math.min(arr.length, remaining);
    remaining -= take;
    return arr.slice(0, take);
  };

  const capped = {
    nodes: { added: cap(diff.nodes.added), removed: cap(diff.nodes.removed) },
    edges: { added: cap(diff.edges.added), removed: cap(diff.edges.removed) },
    props: { set: cap(diff.props.set), removed: cap(diff.props.removed) },
  };

  const shownChanges = diffLimit - remaining;
  return { structuralDiff: capped, diffBaseline, baselineTick, truncated: true, totalChanges, shownChanges };
}

/**
 * Renders a seek command payload as a human-readable string for terminal output.
 *
 * Handles all seek actions: list, drop, save, latest, load, tick, and status.
 *
 * @param {*} payload - Seek result payload from handleSeek
 * @returns {string} Formatted output string (includes trailing newline)
 */
function renderSeek(payload) {
  const formatDelta = (/** @type {*} */ n) => { // TODO(ts-cleanup): type CLI payload
    if (typeof n !== 'number' || !Number.isFinite(n) || n === 0) {
      return '';
    }
    const sign = n > 0 ? '+' : '';
    return ` (${sign}${n})`;
  };

  const formatOpSummaryPlain = (/** @type {*} */ summary) => { // TODO(ts-cleanup): type CLI payload
    const order = [
      ['NodeAdd', '+', 'node'],
      ['EdgeAdd', '+', 'edge'],
      ['PropSet', '~', 'prop'],
      ['NodeTombstone', '-', 'node'],
      ['EdgeTombstone', '-', 'edge'],
      ['BlobValue', '+', 'blob'],
    ];

    const parts = [];
    for (const [opType, symbol, label] of order) {
      const n = summary?.[opType];
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) {
        parts.push(`${symbol}${n}${label}`);
      }
    }
    return parts.length > 0 ? parts.join(' ') : '(empty)';
  };

  const appendReceiptSummary = (/** @type {string} */ baseLine) => {
    const tickReceipt = payload?.tickReceipt;
    if (!tickReceipt || typeof tickReceipt !== 'object') {
      return `${baseLine}\n`;
    }

    const entries = Object.entries(tickReceipt)
      .filter(([writerId, entry]) => writerId && entry && typeof entry === 'object')
      .sort(([a], [b]) => a.localeCompare(b));

    if (entries.length === 0) {
      return `${baseLine}\n`;
    }

    const maxWriterLen = Math.max(5, ...entries.map(([writerId]) => writerId.length));
    const receiptLines = [`  Tick ${payload.tick}:`];
    for (const [writerId, entry] of entries) {
      const sha = typeof entry.sha === 'string' ? entry.sha.slice(0, 7) : '';
      const opSummary = entry.opSummary && typeof entry.opSummary === 'object' ? entry.opSummary : entry;
      receiptLines.push(`    ${writerId.padEnd(maxWriterLen)}  ${sha.padEnd(7)}  ${formatOpSummaryPlain(opSummary)}`);
    }

    return `${baseLine}\n${receiptLines.join('\n')}\n`;
  };

  const buildStateStrings = () => {
    const nodeLabel = payload.nodes === 1 ? 'node' : 'nodes';
    const edgeLabel = payload.edges === 1 ? 'edge' : 'edges';
    const patchLabel = payload.patchCount === 1 ? 'patch' : 'patches';
    return {
      nodesStr: `${payload.nodes} ${nodeLabel}${formatDelta(payload.diff?.nodes)}`,
      edgesStr: `${payload.edges} ${edgeLabel}${formatDelta(payload.diff?.edges)}`,
      patchesStr: `${payload.patchCount} ${patchLabel}`,
    };
  };

  if (payload.action === 'clear-cache') {
    return `${payload.message}\n`;
  }

  if (payload.action === 'list') {
    if (payload.cursors.length === 0) {
      return 'No saved cursors.\n';
    }
    const lines = [];
    for (const c of payload.cursors) {
      const active = c.tick === payload.activeTick ? ' (active)' : '';
      lines.push(`  ${c.name}: tick ${c.tick}${active}`);
    }
    return `${lines.join('\n')}\n`;
  }

  if (payload.action === 'drop') {
    return `Dropped cursor "${payload.name}" (was at tick ${payload.tick}).\n`;
  }

  if (payload.action === 'save') {
    return `Saved cursor "${payload.name}" at tick ${payload.tick}.\n`;
  }

  if (payload.action === 'latest') {
    const { nodesStr, edgesStr } = buildStateStrings();
    const base = appendReceiptSummary(
      `${payload.graph}: returned to present (tick ${payload.maxTick}, ${nodesStr}, ${edgesStr})`,
    );
    return base + formatStructuralDiff(payload);
  }

  if (payload.action === 'load') {
    const { nodesStr, edgesStr } = buildStateStrings();
    const base = appendReceiptSummary(
      `${payload.graph}: loaded cursor "${payload.name}" at tick ${payload.tick} of ${payload.maxTick} (${nodesStr}, ${edgesStr})`,
    );
    return base + formatStructuralDiff(payload);
  }

  if (payload.action === 'tick') {
    const { nodesStr, edgesStr, patchesStr } = buildStateStrings();
    const base = appendReceiptSummary(
      `${payload.graph}: tick ${payload.tick} of ${payload.maxTick} (${nodesStr}, ${edgesStr}, ${patchesStr})`,
    );
    return base + formatStructuralDiff(payload);
  }

  // status (structuralDiff is never populated here; no formatStructuralDiff call)
  if (payload.cursor && payload.cursor.active) {
    const { nodesStr, edgesStr, patchesStr } = buildStateStrings();
    return appendReceiptSummary(
      `${payload.graph}: tick ${payload.tick} of ${payload.maxTick} (${nodesStr}, ${edgesStr}, ${patchesStr})`,
    );
  }

  return `${payload.graph}: no cursor active, ${payload.ticks.length} ticks available\n`;
}

/**
 * Reads the active cursor and sets `_seekCeiling` on the graph instance
 * so that subsequent materialize calls respect the time-travel boundary.
 *
 * Called by non-seek commands (query, path, check, etc.) that should
 * honour an active seek cursor.
 *
 * @param {WarpGraphInstance} graph - WarpGraph instance
 * @param {Persistence} persistence - GraphPersistencePort adapter
 * @param {string} graphName - Name of the WARP graph
 * @returns {Promise<{active: boolean, tick: number|null, maxTick: number|null}>} Cursor info — maxTick is always null; non-seek commands intentionally skip discoverTicks() for performance
 */
async function applyCursorCeiling(graph, persistence, graphName) {
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
 * No-op if the cursor is not active.
 *
 * Non-seek commands (query, path, check, history, materialize) pass null for
 * maxTick to avoid the cost of discoverTicks(); the banner then omits the
 * "of {maxTick}" suffix. Only the seek handler itself populates maxTick.
 *
 * @param {{active: boolean, tick: number|null, maxTick: number|null}} cursorInfo - Result from applyCursorCeiling
 * @param {number|null} maxTick - Maximum Lamport tick (from discoverTicks), or null if unknown
 * @returns {void}
 */
function emitCursorWarning(cursorInfo, maxTick) {
  if (cursorInfo.active) {
    const maxLabel = maxTick !== null && maxTick !== undefined ? ` of ${maxTick}` : '';
    process.stderr.write(`\u26A0 seek active (tick ${cursorInfo.tick}${maxLabel}) \u2014 run "git warp seek --latest" to return to present\n`);
  }
}

/**
 * @param {{options: CliOptions, args: string[]}} params
 * @returns {Promise<{payload: *, exitCode: number}>}
 */
async function handleView({ options, args }) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw usageError('view command requires an interactive terminal (TTY)');
  }

  const viewMode = (args[0] === '--list' || args[0] === 'list') ? 'list'
    : (args[0] === '--log' || args[0] === 'log') ? 'log'
      : 'list';

  try {
    // @ts-expect-error — optional peer dependency, may not be installed
    const { startTui } = await import('@git-stunts/git-warp-tui');
    await startTui({
      repo: options.repo || '.',
      graph: options.graph || 'default',
      mode: viewMode,
    });
  } catch (/** @type {*} */ err) { // TODO(ts-cleanup): type error
    if (err.code === 'ERR_MODULE_NOT_FOUND' || (err.message && err.message.includes('Cannot find module'))) {
      throw usageError(
        'Interactive TUI requires @git-stunts/git-warp-tui.\n' +
        '  Install with: npm install -g @git-stunts/git-warp-tui',
      );
    }
    throw err;
  }
  return { payload: undefined, exitCode: 0 };
}

/** @type {Map<string, Function>} */
const COMMANDS = new Map(/** @type {[string, Function][]} */ ([
  ['info', handleInfo],
  ['query', handleQuery],
  ['path', handlePath],
  ['history', handleHistory],
  ['check', handleCheck],
  ['materialize', handleMaterialize],
  ['seek', handleSeek],
  ['view', handleView],
  ['install-hooks', handleInstallHooks],
]));

/**
 * CLI entry point. Parses arguments, dispatches to the appropriate command handler,
 * and emits the result to stdout (JSON or human-readable).
 * @returns {Promise<void>}
 */
async function main() {
  const { options, positionals } = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    process.exitCode = EXIT_CODES.OK;
    return;
  }

  if (options.json && options.view) {
    throw usageError('--json and --view are mutually exclusive');
  }

  const command = positionals[0];
  if (!command) {
    process.stderr.write(HELP_TEXT);
    process.exitCode = EXIT_CODES.USAGE;
    return;
  }

  const handler = COMMANDS.get(command);
  if (!handler) {
    throw usageError(`Unknown command: ${command}`);
  }

  const VIEW_SUPPORTED_COMMANDS = ['info', 'check', 'history', 'path', 'materialize', 'query', 'seek'];
  if (options.view && !VIEW_SUPPORTED_COMMANDS.includes(command)) {
    throw usageError(`--view is not supported for '${command}'. Supported commands: ${VIEW_SUPPORTED_COMMANDS.join(', ')}`);
  }

  const result = await /** @type {Function} */ (handler)({
    command,
    args: positionals.slice(1),
    options,
  });

  /** @type {{payload: *, exitCode: number}} */
  const normalized = result && typeof result === 'object' && 'payload' in result
    ? result
    : { payload: result, exitCode: EXIT_CODES.OK };

  if (normalized.payload !== undefined) {
    emit(normalized.payload, { json: options.json, command, view: options.view });
  }
  // Use process.exit() to avoid waiting for fire-and-forget I/O (e.g. seek cache writes).
  process.exit(normalized.exitCode ?? EXIT_CODES.OK);
}

main().catch((error) => {
  const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.INTERNAL;
  const code = error instanceof CliError ? error.code : 'E_INTERNAL';
  const message = error instanceof Error ? error.message : 'Unknown error';
  /** @type {{error: {code: string, message: string, cause?: *}}} */
  const payload = { error: { code, message } };

  if (error && error.cause) {
    payload.error.cause = error.cause instanceof Error ? error.cause.message : error.cause;
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${stableStringify(payload)}\n`);
  } else {
    process.stderr.write(renderError(payload));
  }
  process.exit(exitCode);
});
