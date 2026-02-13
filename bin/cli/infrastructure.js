import path from 'node:path';
import process from 'node:process';

/** @typedef {import('./types.js').CliOptions} CliOptions */

export const EXIT_CODES = {
  OK: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  INTERNAL: 3,
};

export const HELP_TEXT = `warp-graph <command> [options]
(or: git warp <command> [options])

Commands:
  info             Summarize graphs in the repo
  query            Run a logical graph query
  path             Find a logical path between two nodes
  history          Show writer history
  check            Report graph health/GC status
  verify-audit     Verify audit receipt chain integrity
  materialize      Materialize and checkpoint all graphs
  seek             Time-travel: step through graph history by Lamport tick
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

Verify-audit options:
  --writer <id>         Verify a single writer's chain (default: all)
  --since <commit>      Verify from tip down to this commit (inclusive)

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

/** @param {string[]} argv */
export function parseArgs(argv) {
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
    ndjson: false,
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

  if (arg === '--ndjson') {
    options.ndjson = true;
    return { consumed: 0 };
  }

  if (arg === '--view') {
    // Valid view modes: ascii, browser, svg:FILE, html:FILE
    // Don't consume known commands as modes
    const KNOWN_COMMANDS = ['info', 'query', 'path', 'history', 'check', 'materialize', 'seek', 'verify-audit', 'install-hooks'];
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

/**
 * @param {{args: string[], index: number, flag: string, shortFlag?: string, allowEmpty?: boolean}} params
 */
export function readOptionValue({ args, index, flag, shortFlag, allowEmpty = false }) {
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
