#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import readline from 'node:readline';
import { execFileSync } from 'node:child_process';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import WarpGraph from '../src/domain/WarpGraph.js';
import GitGraphAdapter from '../src/infrastructure/adapters/GitGraphAdapter.js';
import HealthCheckService from '../src/domain/services/HealthCheckService.js';
import PerformanceClockAdapter from '../src/infrastructure/adapters/PerformanceClockAdapter.js';
import {
  REF_PREFIX,
  buildCheckpointRef,
  buildCoverageRef,
  buildWritersPrefix,
  parseWriterIdFromRef,
} from '../src/domain/utils/RefLayout.js';
import { HookInstaller, classifyExistingHook } from '../src/domain/services/HookInstaller.js';

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
  install-hooks    Install post-merge git hook

Options:
  --repo <path>     Path to git repo (default: cwd)
  --json            Emit JSON output
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

function usageError(message) {
  return new CliError(message, { code: 'E_USAGE', exitCode: EXIT_CODES.USAGE });
}

function notFoundError(message) {
  return new CliError(message, { code: 'E_NOT_FOUND', exitCode: EXIT_CODES.NOT_FOUND });
}

function stableStringify(value) {
  const normalize = (input) => {
    if (Array.isArray(input)) {
      return input.map(normalize);
    }
    if (input && typeof input === 'object') {
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

function parseArgs(argv) {
  const options = createDefaultOptions();
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
    graph: null,
    writer: 'cli',
    help: false,
  };
}

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
    options[matched.key] = result.value;
    return { consumed: result.consumed };
  }

  if (arg.startsWith('-')) {
    throw usageError(`Unknown option: ${arg}`);
  }

  positionals.push(arg, ...argv.slice(index + 1));
  return { consumed: argv.length - index - 1, done: true };
}

function matchOptionDef(arg, optionDefs) {
  return optionDefs.find((def) =>
    arg === def.flag ||
    arg === def.shortFlag ||
    arg.startsWith(`${def.flag}=`)
  );
}

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

async function getGraphInfo(persistence, graphName, { includeWriterIds = false, includeRefs = false } = {}) {
  const writersPrefix = buildWritersPrefix(graphName);
  const writerRefs = typeof persistence.listRefs === 'function'
    ? await persistence.listRefs(writersPrefix)
    : [];
  const writerIds = writerRefs
    .map((ref) => parseWriterIdFromRef(ref))
    .filter(Boolean)
    .sort();

  const info = {
    name: graphName,
    writers: {
      count: writerIds.length,
    },
  };

  if (includeWriterIds) {
    info.writers.ids = writerIds;
  }

  if (includeRefs) {
    const checkpointRef = buildCheckpointRef(graphName);
    const coverageRef = buildCoverageRef(graphName);
    const checkpointSha = await persistence.readRef(checkpointRef);
    const coverageSha = await persistence.readRef(coverageRef);
    info.checkpoint = { ref: checkpointRef, sha: checkpointSha || null };
    info.coverage = { ref: coverageRef, sha: coverageSha || null };
  }

  return info;
}

async function openGraph(options) {
  const { persistence } = await createPersistence(options.repo);
  const graphName = await resolveGraphName(persistence, options.graph);
  const graph = await WarpGraph.open({
    persistence,
    graphName,
    writerId: options.writer,
  });
  return { graph, graphName, persistence };
}

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

function parseWhereProp(value) {
  const [key, ...rest] = value.split('=');
  if (!key || rest.length === 0) {
    throw usageError('Expected --where-prop key=value');
  }
  return { type: 'where-prop', key, value: rest.join('=') };
}

function parseSelectFields(value) {
  if (value === '') {
    return [];
  }
  return value.split(',').map((field) => field.trim()).filter(Boolean);
}

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

function matchesOptionFlag(arg, flag, shortFlag) {
  return arg === flag || (shortFlag && arg === shortFlag);
}

function readNextOptionValue({ args, index, flag, allowEmpty }) {
  const value = args[index + 1];
  if (value === undefined || (!allowEmpty && value === '')) {
    throw usageError(`Missing value for ${flag}`);
  }
  return { value, consumed: 1 };
}

function readInlineOptionValue({ arg, flag, allowEmpty }) {
  const value = arg.slice(flag.length + 1);
  if (!allowEmpty && value === '') {
    throw usageError(`Missing value for ${flag}`);
  }
  return { value, consumed: 0 };
}

function parsePathArgs(args) {
  const options = createPathOptions();
  const labels = [];
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const result = consumePathArg({ args, index: i, options, labels, positionals });
    i += result.consumed;
  }

  finalizePathOptions(options, labels, positionals);
  return options;
}

function createPathOptions() {
  return {
    from: null,
    to: null,
    dir: undefined,
    labelFilter: undefined,
    maxDepth: undefined,
  };
}

function consumePathArg({ args, index, options, labels, positionals }) {
  const arg = args[index];
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

function parseLabels(value) {
  return value.split(',').map((label) => label.trim()).filter(Boolean);
}

function parseMaxDepth(value) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw usageError('Invalid value for --max-depth');
  }
  return parsed;
}

function parseHistoryArgs(args) {
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
  }
  return `${lines.join('\n')}\n`;
}

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

function colorCachedState(state) {
  if (state === 'fresh') {
    return `${ANSI_GREEN}${state}${ANSI_RESET}`;
  }
  if (state === 'stale') {
    return `${ANSI_YELLOW}${state}${ANSI_RESET}`;
  }
  return `${ANSI_RED}${ANSI_DIM}${state}${ANSI_RESET}`;
}

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

function renderError(payload) {
  return `Error: ${payload.error.message}\n`;
}

function emit(payload, { json, command }) {
  if (json) {
    process.stdout.write(`${stableStringify(payload)}\n`);
    return;
  }

  if (command === 'info') {
    process.stdout.write(renderInfo(payload));
    return;
  }

  if (command === 'query') {
    process.stdout.write(renderQuery(payload));
    return;
  }

  if (command === 'path') {
    process.stdout.write(renderPath(payload));
    return;
  }

  if (command === 'check') {
    process.stdout.write(renderCheck(payload));
    return;
  }

  if (command === 'history') {
    process.stdout.write(renderHistory(payload));
    return;
  }

  if (command === 'materialize') {
    process.stdout.write(renderMaterialize(payload));
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
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @returns {Promise<{repo: string, graphs: Object[]}>} Info payload
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

  const graphs = [];
  for (const name of graphNames) {
    const includeDetails = detailGraphs.has(name);
    graphs.push(await getGraphInfo(persistence, name, {
      includeWriterIds: includeDetails,
      includeRefs: includeDetails,
    }));
  }

  return {
    repo: options.repo,
    graphs,
  };
}

/**
 * Handles the `query` command: runs a logical graph query.
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @param {string[]} params.args - Remaining positional arguments (query spec)
 * @returns {Promise<{payload: Object, exitCode: number}>} Query result payload
 * @throws {CliError} On invalid query options or query execution errors
 */
async function handleQuery({ options, args }) {
  const querySpec = parseQueryArgs(args);
  const { graph, graphName } = await openGraph(options);
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
    return {
      payload: buildQueryPayload(graphName, result),
      exitCode: EXIT_CODES.OK,
    };
  } catch (error) {
    throw mapQueryError(error);
  }
}

function applyQuerySteps(builder, steps) {
  let current = builder;
  for (const step of steps) {
    current = applyQueryStep(current, step);
  }
  return current;
}

function applyQueryStep(builder, step) {
  if (step.type === 'outgoing') {
    return builder.outgoing(step.label);
  }
  if (step.type === 'incoming') {
    return builder.incoming(step.label);
  }
  if (step.type === 'where-prop') {
    return builder.where((node) => matchesPropFilter(node, step.key, step.value));
  }
  return builder;
}

function matchesPropFilter(node, key, value) {
  const props = node.props || {};
  if (!Object.prototype.hasOwnProperty.call(props, key)) {
    return false;
  }
  return String(props[key]) === value;
}

function buildQueryPayload(graphName, result) {
  return {
    graph: graphName,
    stateHash: result.stateHash,
    nodes: result.nodes,
  };
}

function mapQueryError(error) {
  if (error && error.code && String(error.code).startsWith('E_QUERY')) {
    throw usageError(error.message);
  }
  throw error;
}

/**
 * Handles the `path` command: finds a shortest path between two nodes.
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @param {string[]} params.args - Remaining positional arguments (path spec)
 * @returns {Promise<{payload: Object, exitCode: number}>} Path result payload
 * @throws {CliError} If --from/--to are missing or a node is not found
 */
async function handlePath({ options, args }) {
  const pathOptions = parsePathArgs(args);
  const { graph, graphName } = await openGraph(options);

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

    return {
      payload: {
        graph: graphName,
        from: pathOptions.from,
        to: pathOptions.to,
        ...result,
      },
      exitCode: result.found ? EXIT_CODES.OK : EXIT_CODES.NOT_FOUND,
    };
  } catch (error) {
    if (error && error.code === 'NODE_NOT_FOUND') {
      throw notFoundError(error.message);
    }
    throw error;
  }
}

/**
 * Handles the `check` command: reports graph health, GC, and hook status.
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @returns {Promise<{payload: Object, exitCode: number}>} Health check payload
 */
async function handleCheck({ options }) {
  const { graph, graphName, persistence } = await openGraph(options);
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

async function getHealth(persistence) {
  const clock = new PerformanceClockAdapter();
  const healthService = new HealthCheckService({ persistence, clock });
  return await healthService.getHealth();
}

async function getGcMetrics(graph) {
  await graph.materialize();
  return graph.getGCMetrics();
}

async function collectWriterHeads(graph) {
  const frontier = await graph.getFrontier();
  return [...frontier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([writerId, sha]) => ({ writerId, sha }));
}

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

async function readCheckpointDate(persistence, checkpointSha) {
  if (!checkpointSha) {
    return null;
  }
  const info = await persistence.getNodeInfo(checkpointSha);
  return info.date || null;
}

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
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @param {string[]} params.args - Remaining positional arguments (history options)
 * @returns {Promise<{payload: Object, exitCode: number}>} History payload
 * @throws {CliError} If no patches are found for the writer
 */
async function handleHistory({ options, args }) {
  const historyOptions = parseHistoryArgs(args);
  const { graph, graphName } = await openGraph(options);
  const writerId = options.writer;
  const patches = await graph.getWriterPatches(writerId);
  if (patches.length === 0) {
    throw notFoundError(`No patches found for writer: ${writerId}`);
  }

  const entries = patches
    .filter(({ patch }) => !historyOptions.node || patchTouchesNode(patch, historyOptions.node))
    .map(({ patch, sha }) => ({
      sha,
      schema: patch.schema,
      lamport: patch.lamport,
      opCount: Array.isArray(patch.ops) ? patch.ops.length : 0,
    }));

  const payload = {
    graph: graphName,
    writer: writerId,
    nodeFilter: historyOptions.node,
    entries,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

async function materializeOneGraph({ persistence, graphName, writerId }) {
  const graph = await WarpGraph.open({ persistence, graphName, writerId });
  await graph.materialize();
  const nodes = await graph.getNodes();
  const edges = await graph.getEdges();
  const checkpoint = await graph.createCheckpoint();
  return { graph: graphName, nodes: nodes.length, edges: edges.length, checkpoint };
}

/**
 * Handles the `materialize` command: materializes and checkpoints all graphs.
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @returns {Promise<{payload: Object, exitCode: number}>} Materialize result payload
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
  for (const name of targets) {
    try {
      const result = await materializeOneGraph({
        persistence,
        graphName: name,
        writerId: options.writer,
      });
      results.push(result);
    } catch (error) {
      results.push({
        graph: name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  const allFailed = results.every((r) => r.error);
  return {
    payload: { graphs: results },
    exitCode: allFailed ? EXIT_CODES.INTERNAL : EXIT_CODES.OK,
  };
}

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
  return new HookInstaller({
    fs,
    execGitConfig: execGitConfigValue,
  });
}

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
 * @param {Object} params
 * @param {Object} params.options - Parsed CLI options
 * @param {string[]} params.args - Remaining positional arguments (install-hooks options)
 * @returns {Promise<{payload: Object, exitCode: number}>} Install result payload
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

function readHookContent(hookPath) {
  try {
    return fs.readFileSync(hookPath, 'utf8');
  } catch {
    return null;
  }
}

function getHookStatusForCheck(repoPath) {
  try {
    const installer = createHookInstaller();
    return installer.getHookStatus(repoPath);
  } catch {
    return null;
  }
}

const COMMANDS = new Map([
  ['info', handleInfo],
  ['query', handleQuery],
  ['path', handlePath],
  ['history', handleHistory],
  ['check', handleCheck],
  ['materialize', handleMaterialize],
  ['install-hooks', handleInstallHooks],
]);

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

  const result = await handler({
    command,
    args: positionals.slice(1),
    options,
  });

  const normalized = result && typeof result === 'object' && 'payload' in result
    ? result
    : { payload: result, exitCode: EXIT_CODES.OK };

  if (normalized.payload !== undefined) {
    emit(normalized.payload, { json: options.json, command });
  }
  process.exitCode = normalized.exitCode ?? EXIT_CODES.OK;
}

main().catch((error) => {
  const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.INTERNAL;
  const code = error instanceof CliError ? error.code : 'E_INTERNAL';
  const message = error instanceof Error ? error.message : 'Unknown error';
  const payload = { error: { code, message } };

  if (error && error.cause) {
    payload.error.cause = error.cause instanceof Error ? error.cause.message : error.cause;
  }

  if (process.argv.includes('--json')) {
    process.stdout.write(`${stableStringify(payload)}\n`);
  } else {
    process.stderr.write(renderError(payload));
  }
  process.exitCode = exitCode;
});
