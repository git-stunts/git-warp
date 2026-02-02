#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import GitPlumbing, { ShellRunnerFactory } from '@git-stunts/plumbing';
import { GitGraphAdapter } from '../index.js';
import { REF_PREFIX } from '../src/domain/utils/RefLayout.js';

const EXIT_CODES = {
  OK: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  INTERNAL: 3,
};

const HELP_TEXT = `warp-graph <command> [options]

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

function renderInfo(payload) {
  const lines = [`Repo: ${payload.repo}`];
  lines.push(`Graphs: ${payload.graphs.length}`);
  for (const graph of payload.graphs) {
    lines.push(`- ${graph.name}`);
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

  return {
    repo: options.repo,
    graphs: graphNames.map((name) => ({ name })),
  };
}

async function handleNotImplemented({ command }) {
  throw new CliError(`${command} is not implemented yet`, {
    code: 'E_NOT_IMPLEMENTED',
    exitCode: EXIT_CODES.INTERNAL,
  });
}

const COMMANDS = new Map([
  ['info', handleInfo],
  ['query', handleNotImplemented],
  ['path', handleNotImplemented],
  ['history', handleNotImplemented],
  ['check', handleNotImplemented],
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

  const payload = await handler({
    command,
    args: positionals.slice(1),
    options,
  });

  if (payload !== undefined) {
    emit(payload, { json: options.json, command });
  }
  process.exitCode = EXIT_CODES.OK;
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
