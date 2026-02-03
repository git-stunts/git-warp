#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
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

const EXIT_CODES = {
  OK: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  INTERNAL: 3,
};

const HELP_TEXT = `warp-graph <command> [options]
(or: git warp <command> [options])

Commands:
  info       Summarize graphs in the repo
  query      Run a logical graph query
  path       Find a logical path between two nodes
  history    Show writer history
  check      Report graph health/GC status

Options:
  --repo <path>     Path to git repo (default: cwd)
  --json            Emit JSON output
  --graph <name>    Graph name (required if repo has multiple graphs)
  --writer <id>     Writer id (default: cli)
  -h, --help        Show this help

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

class CliError extends Error {
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

function renderCheck(payload) {
  const lines = [
    `Graph: ${payload.graph}`,
    `Health: ${payload.health.status}`,
  ];

  if (payload.checkpoint?.sha) {
    lines.push(`Checkpoint: ${payload.checkpoint.sha}`);
    if (payload.checkpoint.ageSeconds !== null) {
      lines.push(`Checkpoint Age: ${payload.checkpoint.ageSeconds}s`);
    }
  } else {
    lines.push('Checkpoint: none');
  }

  lines.push(`Writers: ${payload.writers.count}`);
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
    lines.push(`Tombstone Ratio: ${payload.gc.tombstoneRatio}`);
  }

  return `${lines.join('\n')}\n`;
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

  if (payload?.error) {
    process.stderr.write(renderError(payload));
    return;
  }

  process.stdout.write(`${stableStringify(payload)}\n`);
}

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

async function handleCheck({ options }) {
  const { graph, graphName, persistence } = await openGraph(options);
  const health = await getHealth(persistence);
  const gcMetrics = await getGcMetrics(graph);
  const writerHeads = await collectWriterHeads(graph);
  const checkpoint = await loadCheckpointInfo(persistence, graphName);
  const coverage = await loadCoverageInfo(persistence, graphName, writerHeads);

  return {
    payload: buildCheckPayload({
      repo: options.repo,
      graphName,
      health,
      checkpoint,
      writerHeads,
      coverage,
      gcMetrics,
    }),
    exitCode: EXIT_CODES.OK,
  };
}

async function getHealth(persistence) {
  const clock = new PerformanceClockAdapter();
  const healthService = new HealthCheckService({ persistence, clock });
  return healthService.getHealth();
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
  };
}

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

const COMMANDS = new Map([
  ['info', handleInfo],
  ['query', handleQuery],
  ['path', handlePath],
  ['history', handleHistory],
  ['check', handleCheck],
]);

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
