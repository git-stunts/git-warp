#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import WarpGraph, {
  GitGraphAdapter,
  HealthCheckService,
  PerformanceClockAdapter,
} from '../index.js';
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
  const options = {
    repo: process.cwd(),
    json: false,
    graph: null,
    writer: 'cli',
    help: false,
  };
  const positionals = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--repo' || arg === '-r') {
      const value = argv[i + 1];
      if (!value) throw usageError('Missing value for --repo');
      options.repo = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--repo=')) {
      options.repo = arg.slice('--repo='.length);
      continue;
    }

    if (arg === '--graph') {
      const value = argv[i + 1];
      if (!value) throw usageError('Missing value for --graph');
      options.graph = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--graph=')) {
      options.graph = arg.slice('--graph='.length);
      continue;
    }

    if (arg === '--writer') {
      const value = argv[i + 1];
      if (!value) throw usageError('Missing value for --writer');
      options.writer = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--writer=')) {
      options.writer = arg.slice('--writer='.length);
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      options.help = true;
      continue;
    }

    if (arg.startsWith('-')) {
      throw usageError(`Unknown option: ${arg}`);
    }

    positionals.push(arg);
  }

  options.repo = path.resolve(options.repo);
  return { options, positionals };
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
    if (!ref.startsWith(prefix)) continue;
    const rest = ref.slice(prefix.length);
    const [graphName] = rest.split('/');
    if (graphName) {
      names.add(graphName);
    }
  }

  return [...names].sort();
}

async function resolveGraphName(persistence, explicitGraph) {
  if (explicitGraph) return explicitGraph;
  const graphNames = await listGraphNames(persistence);
  if (graphNames.length === 1) return graphNames[0];
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
    const arg = args[i];

    if (arg === '--match') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --match');
      spec.match = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--match=')) {
      spec.match = arg.slice('--match='.length);
      continue;
    }

    if (arg === '--outgoing' || arg === '--incoming') {
      const next = args[i + 1];
      const label = next && !next.startsWith('-') ? next : undefined;
      if (label) i += 1;
      spec.steps.push({ type: arg.slice(2), label });
      continue;
    }

    if (arg === '--where-prop') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --where-prop');
      const [key, ...rest] = value.split('=');
      if (!key || rest.length === 0) {
        throw usageError('Expected --where-prop key=value');
      }
      spec.steps.push({ type: 'where-prop', key, value: rest.join('=') });
      i += 1;
      continue;
    }

    if (arg.startsWith('--where-prop=')) {
      const value = arg.slice('--where-prop='.length);
      const [key, ...rest] = value.split('=');
      if (!key || rest.length === 0) {
        throw usageError('Expected --where-prop key=value');
      }
      spec.steps.push({ type: 'where-prop', key, value: rest.join('=') });
      continue;
    }

    if (arg === '--select') {
      const value = args[i + 1];
      if (value === undefined) throw usageError('Missing value for --select');
      spec.select = value === '' ? [] : value.split(',').map((field) => field.trim()).filter(Boolean);
      i += 1;
      continue;
    }

    if (arg.startsWith('--select=')) {
      const value = arg.slice('--select='.length);
      spec.select = value === '' ? [] : value.split(',').map((field) => field.trim()).filter(Boolean);
      continue;
    }

    throw usageError(`Unknown query option: ${arg}`);
  }

  return spec;
}

function parsePathArgs(args) {
  const options = {
    from: null,
    to: null,
    dir: undefined,
    labelFilter: undefined,
    maxDepth: undefined,
  };
  const labels = [];
  const positionals = [];

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--from') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --from');
      options.from = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--from=')) {
      options.from = arg.slice('--from='.length);
      continue;
    }

    if (arg === '--to') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --to');
      options.to = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--to=')) {
      options.to = arg.slice('--to='.length);
      continue;
    }

    if (arg === '--dir') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --dir');
      options.dir = value;
      i += 1;
      continue;
    }

    if (arg.startsWith('--dir=')) {
      options.dir = arg.slice('--dir='.length);
      continue;
    }

    if (arg === '--label') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --label');
      labels.push(...value.split(',').map((label) => label.trim()).filter(Boolean));
      i += 1;
      continue;
    }

    if (arg.startsWith('--label=')) {
      const value = arg.slice('--label='.length);
      labels.push(...value.split(',').map((label) => label.trim()).filter(Boolean));
      continue;
    }

    if (arg === '--max-depth') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --max-depth');
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) throw usageError('Invalid value for --max-depth');
      options.maxDepth = parsed;
      i += 1;
      continue;
    }

    if (arg.startsWith('--max-depth=')) {
      const value = arg.slice('--max-depth='.length);
      const parsed = Number.parseInt(value, 10);
      if (Number.isNaN(parsed)) throw usageError('Invalid value for --max-depth');
      options.maxDepth = parsed;
      continue;
    }

    if (arg.startsWith('-')) {
      throw usageError(`Unknown path option: ${arg}`);
    }

    positionals.push(arg);
  }

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

  return options;
}

function parseHistoryArgs(args) {
  const options = { node: null };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (arg === '--node') {
      const value = args[i + 1];
      if (!value) throw usageError('Missing value for --node');
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
    if (op.node === nodeId) return true;
    if (op.from === nodeId || op.to === nodeId) return true;
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

  for (const step of querySpec.steps) {
    if (step.type === 'outgoing') {
      builder = builder.outgoing(step.label);
      continue;
    }
    if (step.type === 'incoming') {
      builder = builder.incoming(step.label);
      continue;
    }
    if (step.type === 'where-prop') {
      const key = step.key;
      const value = step.value;
      builder = builder.where((node) => {
        const props = node.props || {};
        if (!Object.prototype.hasOwnProperty.call(props, key)) {
          return false;
        }
        return String(props[key]) === value;
      });
    }
  }

  if (querySpec.select !== null) {
    builder = builder.select(querySpec.select);
  }

  try {
    const result = await builder.run();
    return {
      payload: {
        graph: graphName,
        stateHash: result.stateHash,
        nodes: result.nodes,
      },
      exitCode: EXIT_CODES.OK,
    };
  } catch (error) {
    if (error && error.code && String(error.code).startsWith('E_QUERY')) {
      throw usageError(error.message);
    }
    throw error;
  }
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
  const clock = new PerformanceClockAdapter();
  const healthService = new HealthCheckService({ persistence, clock });
  const health = await healthService.getHealth();

  await graph.materialize();
  const gcMetrics = graph.getGCMetrics();

  const frontier = await graph.getFrontier();
  const writerHeads = [...frontier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([writerId, sha]) => ({ writerId, sha }));

  const checkpointRef = buildCheckpointRef(graphName);
  const checkpointSha = await persistence.readRef(checkpointRef);
  let checkpointDate = null;
  let checkpointAgeSeconds = null;

  if (checkpointSha) {
    const info = await persistence.getNodeInfo(checkpointSha);
    checkpointDate = info.date || null;
    const parsed = checkpointDate ? Date.parse(checkpointDate) : Number.NaN;
    if (!Number.isNaN(parsed)) {
      checkpointAgeSeconds = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
    }
  }

  const coverageRef = buildCoverageRef(graphName);
  const coverageSha = await persistence.readRef(coverageRef);
  const missingWriters = [];

  if (coverageSha) {
    for (const head of writerHeads) {
      const reachable = await persistence.isAncestor(head.sha, coverageSha);
      if (!reachable) {
        missingWriters.push(head.writerId);
      }
    }
  }

  const payload = {
    repo: options.repo,
    graph: graphName,
    health,
    checkpoint: {
      ref: checkpointRef,
      sha: checkpointSha || null,
      date: checkpointDate,
      ageSeconds: checkpointAgeSeconds,
    },
    writers: {
      count: writerHeads.length,
      heads: writerHeads,
    },
    coverage: {
      ref: coverageRef,
      sha: coverageSha || null,
      missingWriters: missingWriters.sort(),
    },
    gc: gcMetrics,
  };

  return { payload, exitCode: EXIT_CODES.OK };
}

async function handleHistory({ options, args }) {
  const historyOptions = parseHistoryArgs(args);
  const { graph, graphName } = await openGraph(options);
  const writerId = options.writer;

  if (!writerId) {
    throw usageError('history requires --writer <id>');
  }

  const patches = await graph._loadWriterPatches(writerId);
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

async function handleNotImplemented({ command }) {
  throw new CliError(`${command} is not implemented yet`, {
    code: 'E_NOT_IMPLEMENTED',
    exitCode: EXIT_CODES.INTERNAL,
  });
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
