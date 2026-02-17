import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs } from 'node:util';

/** @typedef {import('./types.js').CliOptions} CliOptions */

export const EXIT_CODES = {
  OK: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  INTERNAL: 3,
  /** Trust policy denial (enforce mode). */
  TRUST_FAIL: 4,
  /** Valid result but negative (e.g. no path found). Follows grep convention. */
  NO_MATCH: 1,
};

/**
 * Reads an environment variable across Node, Bun, and Deno runtimes.
 * @param {string} name
 * @returns {string|undefined}
 */
export function getEnvVar(name) {
  if (typeof process !== 'undefined' && process.env) {
    return process.env[name];
  }
  if (typeof Deno !== 'undefined') {
    // eslint-disable-next-line no-undef
    try { return Deno.env.get(name); } catch { return undefined; }
  }
  return undefined;
}

export const HELP_TEXT = `warp-graph <command> [options]
(or: git warp <command> [options])

Commands:
  info             Summarize graphs in the repo
  query            Run a logical graph query
  path             Find a logical path between two nodes
  history          Show writer history
  check            Report graph health/GC status
  doctor           Diagnose structural issues and suggest fixes
  verify-audit     Verify audit receipt chain integrity
  trust            Evaluate writer trust from signed evidence
  materialize      Materialize and checkpoint all graphs
  seek             Time-travel: step through graph history by Lamport tick
  patch            Decode and inspect raw patches
  tree             ASCII tree traversal from root nodes
  view             Interactive TUI graph browser (requires @git-stunts/git-warp-tui)
  install-hooks    Install post-merge git hook

Options:
  --repo <path>     Path to git repo (default: cwd)
  --json            Emit JSON output (pretty-printed, sorted keys)
  --ndjson          Emit compact single-line JSON (for piping/scripting)
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

Doctor options:
  --strict              Treat warnings as failures (exit 4)

Verify-audit options:
  --writer <id>         Verify a single writer's chain (default: all)
  --since <commit>      Verify from tip down to this commit (inclusive)
  --trust-mode <mode>   Trust evaluation mode (warn, enforce)
  --trust-pin <sha>     Pin trust evaluation to a specific record chain commit

Trust options:
  --mode <warn|enforce> Override trust evaluation mode
  --trust-pin <sha>     Pin trust evaluation to a specific record chain commit

Seek options:
  --tick <N|+N|-N>      Jump to tick N, or step forward/backward
  --latest              Clear cursor, return to present
  --save <name>         Save current position as named cursor
  --load <name>         Restore a saved cursor
  --list                List all saved cursors
  --drop <name>         Delete a saved cursor
  --diff                Show structural diff (added/removed nodes, edges, props)
  --diff-limit <N>      Max diff entries (default 2000)

Patch options:
  show <sha>            Decode and display a single patch as JSON
  list                  List all patches sorted by Lamport clock
  --writer <id>         Filter by writer (list only)
  --limit <n>           Max entries to show (list only)

Tree options:
  [rootNode]            Root node id (auto-detected if omitted)
  --edge <label>        Follow only this edge label
  --prop <key>          Annotate nodes with this property (repeatable)
  --max-depth <n>       Maximum traversal depth
`;

/**
 * Structured CLI error with exit code and error code.
 */
export class CliError extends Error {
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
export function usageError(message) {
  return new CliError(message, { code: 'E_USAGE', exitCode: EXIT_CODES.USAGE });
}

/** @param {string} message */
export function notFoundError(message) {
  return new CliError(message, { code: 'E_NOT_FOUND', exitCode: EXIT_CODES.NOT_FOUND });
}

export const KNOWN_COMMANDS = ['info', 'query', 'path', 'history', 'check', 'doctor', 'materialize', 'seek', 'verify-audit', 'trust', 'patch', 'tree', 'install-hooks', 'view'];

const BASE_OPTIONS = {
  repo:   { type: 'string', short: 'r' },
  json:   { type: 'boolean', default: false },
  ndjson: { type: 'boolean', default: false },
  view:   { type: 'string' },
  graph:  { type: 'string' },
  writer: { type: 'string', default: 'cli' },
  help:   { type: 'boolean', short: 'h', default: false },
};

/**
 * Pre-processes argv to handle --view's optional-value semantics.
 * If --view is followed by a command name or flag (or is last), injects 'ascii'.
 * Validates the view mode value.
 * @param {string[]} argv
 * @returns {string[]}
 */
function preprocessView(argv) {
  const idx = argv.indexOf('--view');
  if (idx === -1) {
    return argv;
  }
  const next = argv[idx + 1];
  const needsDefault = !next || next.startsWith('-') || KNOWN_COMMANDS.includes(next);
  if (needsDefault) {
    return [...argv.slice(0, idx + 1), 'ascii', ...argv.slice(idx + 1)];
  }
  const validModes = ['ascii', 'browser'];
  const validPrefixes = ['svg:', 'html:'];
  const isValid = validModes.includes(next) ||
    validPrefixes.some((prefix) => next.startsWith(prefix));
  if (!isValid) {
    throw usageError(`Invalid view mode: ${next}. Valid modes: ascii, browser, svg:FILE, html:FILE`);
  }
  return argv;
}

/** String flags that always consume a value argument */
const BASE_STRING_FLAGS = new Set(['--repo', '-r', '--graph', '--writer']);
/** Boolean flags (no value) */
const BASE_BOOL_FLAGS = new Set(['--json', '--ndjson', '--help', '-h']);

/**
 * Checks if a value looks like it belongs to --view (not a flag or command).
 * @param {string|undefined} next
 * @returns {boolean}
 */
function isViewValue(next) {
  if (!next || next.startsWith('-') || KNOWN_COMMANDS.includes(next)) {
    return false;
  }
  return true;
}

/**
 * Extracts base flags from anywhere in argv, leaving command + commandArgs.
 *
 * Base flags (--repo, --graph, --writer, --view, --json, --ndjson, --help)
 * can appear before or after the command. Everything else (unknown flags,
 * positionals after the command) becomes commandArgs.
 *
 * @param {string[]} argv
 * @returns {{baseArgs: string[], command: string|undefined, commandArgs: string[]}}
 */
function extractBaseArgs(argv) {
  /** @type {string[]} */
  const baseArgs = [];
  /** @type {string[]} */
  const rest = [];
  /** @type {string|undefined} */
  let command;
  let pastCommand = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }

    if (BASE_STRING_FLAGS.has(arg)) {
      baseArgs.push(arg);
      if (i + 1 < argv.length) {
        baseArgs.push(argv[++i]);
      }
      continue;
    }

    // Handle --flag=value form for string flags
    if (arg.startsWith('--') && BASE_STRING_FLAGS.has(arg.split('=')[0])) {
      baseArgs.push(arg);
      continue;
    }

    // --view has optional-value semantics: consume next only if it looks like a view mode
    if (arg === '--view') {
      baseArgs.push(arg);
      if (isViewValue(argv[i + 1])) {
        baseArgs.push(argv[++i]);
      }
      continue;
    }

    if (arg.startsWith('--view=')) {
      baseArgs.push(arg);
      continue;
    }

    if (BASE_BOOL_FLAGS.has(arg)) {
      baseArgs.push(arg);
      continue;
    }

    if (!pastCommand && !arg.startsWith('-')) {
      command = arg;
      pastCommand = true;
      continue;
    }

    rest.push(arg);
  }

  return { baseArgs, command, commandArgs: rest };
}

/**
 * Two-pass arg parser using node:util.parseArgs.
 *
 * Pass 1: extract base flags from anywhere in argv.
 * Pass 2: pre-process --view (optional-value semantics) on base args.
 * Pass 3: parseArgs with strict:true on base args only.
 *
 * @param {string[]} argv
 * @returns {{options: CliOptions, command: string|undefined, commandArgs: string[]}}
 */
export function parseArgs(argv) {
  const { baseArgs, command, commandArgs } = extractBaseArgs(argv);
  const processed = preprocessView(baseArgs);

  /** @type {{ values: Record<string, string|boolean|string[]|boolean[]|undefined>, positionals: string[] }} */
  let parsed;
  try {
    parsed = nodeParseArgs({
      args: processed,
      options: /** @type {import('node:util').ParseArgsConfig['options']} */ (BASE_OPTIONS),
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    throw usageError(err instanceof Error ? err.message : String(err));
  }

  const { values } = parsed;

  /** @type {CliOptions} */
  const options = {
    repo: path.resolve(typeof values.repo === 'string' ? values.repo : process.cwd()),
    json: Boolean(values.json),
    ndjson: Boolean(values.ndjson),
    view: typeof values.view === 'string' ? values.view : null,
    graph: typeof values.graph === 'string' ? values.graph : null,
    writer: typeof values.writer === 'string' ? values.writer : 'cli',
    help: Boolean(values.help),
  };

  return { options, command, commandArgs };
}

/**
 * Parses command-level args using node:util.parseArgs + Zod validation.
 *
 * @param {string[]} args - Command-specific args (after command name)
 * @param {Object} config - parseArgs options config
 * @param {import('zod').ZodType} schema - Zod schema to validate/transform parsed values
 * @param {Object} [opts]
 * @param {boolean} [opts.allowPositionals=false] - Whether to allow positional arguments
 * @returns {{values: *, positionals: string[]}}
 */
export function parseCommandArgs(args, config, schema, { allowPositionals = false } = {}) {
  /** @type {{ values: Record<string, string|boolean|string[]|boolean[]|undefined>, positionals: string[] }} */
  let parsed;
  try {
    parsed = nodeParseArgs({
      args,
      options: /** @type {import('node:util').ParseArgsConfig['options']} */ (config),
      strict: true,
      allowPositionals,
    });
  } catch (err) {
    throw usageError(err instanceof Error ? err.message : String(err));
  }

  const result = schema.safeParse(parsed.values);
  if (!result.success) {
    const msg = result.error.issues.map((/** @type {{message: string}} */ issue) => issue.message).join('; ');
    throw usageError(msg);
  }

  return { values: result.data, positionals: parsed.positionals || [] };
}

