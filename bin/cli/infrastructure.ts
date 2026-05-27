import path from 'node:path';
import process from 'node:process';
import { parseArgs as nodeParseArgs, type ParseArgsConfig } from 'node:util';
import type { ZodType, ZodTypeDef } from 'zod';

import type { CliOptions } from './types.ts';

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
 */
export function getEnvVar(name: string): string | undefined {
  if (typeof process !== 'undefined' && process.env !== null && process.env !== undefined) {
    return process.env[name];
  }
  if (typeof Deno !== 'undefined') {

    try { return Deno.env.get(name); } catch { return undefined; }
  }
  return undefined;
}

export const HELP_TEXT = `warp-graph <command> [options]
(or: git warp <command> [options])

Commands:
  info             Summarize graphs in the repo
  check            Report graph health/GC status
  doctor           Diagnose structural issues and suggest fixes
  debug            Inspect substrate history and conflict state
                     coordinate         Inspect the resolved observation coordinate
                       --lamport-ceiling <n>  Inspect no later than Lamport tick n
                     conflicts          Analyze conflict provenance at the current frontier
                       --strand <id>         Analyze one pinned strand instead of the live frontier
                       --entity-id <id>       Filter by entity id
                       --target-kind <kind>   node, edge, node_property, edge_property
                       --property-key <key>   Property key for *_property targets
                       --from <id>            Edge source for edge selectors
                       --to <id>              Edge destination for edge selectors
                       --label <label>        Edge label for edge selectors
                       --kind <kind>          supersession, eventual_override, redundancy (repeatable)
                       --writer-id <id>       Filter returned traces by writer id
                       --lamport-ceiling <n>  Analyze no later than Lamport tick n
                       --evidence <level>     summary, standard, full
                       --max-patches <n>      Deterministic scan budget
                     provenance         Trace causal patch provenance for an entity id
                       --strand <id>         Inspect provenance inside one pinned strand
                       --entity-id <id>       Entity id to inspect
                       --lamport-ceiling <n>  Analyze no later than Lamport tick n
                       --max-patches <n>      Limit returned provenance entries
                     receipts           Inspect reducer tick receipts and per-op outcomes
                       --strand <id>         Materialize and inspect one pinned strand
                       --writer-id <id>       Filter receipts by writer id
                       --patch <sha>          Filter receipts by patch SHA/prefix
                       --target <target>      Filter matching ops by exact receipt target
                       --result <kind>        applied, superseded, redundant (repeatable)
                       --op <type>            Receipt op type (repeatable)
                       --lamport-ceiling <n>  Analyze no later than Lamport tick n
                       --limit <n>            Limit returned receipts
                     timeline           Inspect a cross-writer causal patch timeline
                       --strand <id>         Inspect the visible patch universe of one pinned strand
                       --entity-id <id>       Filter to patches touching an entity id
                       --writer-id <id>       Filter to a specific writer
                       --lamport-floor <n>    Include no earlier than Lamport tick n
                       --lamport-ceiling <n>  Include no later than Lamport tick n
                       --limit <n>            Return the newest N entries in causal order
  strand      Manage pinned strand descriptors
                     create             Create a pinned strand descriptor
                       --id <id>               Explicit strand id
                       --lamport-ceiling <n>   Pin no later than Lamport tick n
                       --owner <id>            Optional owner metadata
                       --scope <text>          Optional scope metadata
                       --lease-expires-at <ts> Optional ISO-8601 lease expiry metadata
                     braid <id>        Pin read-only braid overlays onto a target strand
                       --support <id>         Braided support strand id (repeatable)
                       --read-only            Disable writes to the target overlay
                       --writable             Re-enable writes to the target overlay
                     list               List strand descriptors for the graph
                     show <id>          Show a single strand descriptor
                     compare <id>       Compare a strand against another substrate surface
                       --against <sel>        base, live, or strand:<id>
                       --target-id <id>       Limit target-local helpers to one entity id
                       --lamport-ceiling <n>  Apply an additional ceiling to the strand
                       --against-lamport-ceiling <n>
                                              Apply an additional ceiling to the comparison side
                     transfer-plan <id> Plan a deterministic transfer from one strand into live, base, or another strand
                       --into <sel>           live, base, or strand:<id>
                       --lamport-ceiling <n>  Apply an additional ceiling to the source strand
                       --into-lamport-ceiling <n>
                                              Apply an additional ceiling to the target side
                    materialize <id>   Inspect a pinned strand replay
                       --receipts             Include tick receipts
                     drop <id>          Delete a strand descriptor
  verify-audit     Verify audit receipt chain integrity
  verify-index     Verify bitmap index integrity by sampling
  reindex          Force full index rebuild
  trust            Evaluate writer trust from signed evidence
  materialize      Diagnostic replay/checkpoint for graph state
  seek             Time-travel: step through graph history by Lamport tick
  patch            Decode and inspect raw patches
  tree             ASCII tree traversal from root nodes
  bisect           Binary search for first bad patch in writer history
  install-hooks    Install post-merge git hook

Options:
  --repo <path>     Path to git repo (default: cwd)
  --json            Emit JSON output (pretty-printed, sorted keys)
  --ndjson          Emit compact single-line JSON (for piping/scripting)
  --view [mode]     Visual output (ascii, svg:FILE, html:FILE)
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

Verify-index options:
  --seed <n>              PRNG seed for reproducible sampling
  --sample-rate <rate>    Fraction of nodes to verify (>0 and <=1, default 0.1)

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

Bisect options:
  --good <sha>          Known-good commit SHA (invariant holds)
  --bad <sha>           Known-bad commit SHA (invariant violated)
  --test <command>      Shell command (exit 0=good, non-zero=bad)
  --writer <id>         Writer chain to bisect (required)
`;

/**
 * Structured CLI error with exit code and error code.
 */
export class CliError extends Error {
  code: string;
  exitCode: number;
  override cause: Error | undefined;

  /**
   * Constructs a CLI error with a human-readable message and optional metadata.
   */
  constructor(message: string, options: { code?: string; exitCode?: number; cause?: Error } = {}) {
    super(message);
    const {
      code = 'E_CLI',
      exitCode = EXIT_CODES.INTERNAL,
      cause,
    } = options;
    this.code = code;
    this.exitCode = exitCode;
    this.cause = cause;
  }
}

/**
 * Creates a CliError tagged as a usage error with exit code USAGE.
 */
export function usageError(message: string): CliError {
  return new CliError(message, { code: 'E_USAGE', exitCode: EXIT_CODES.USAGE });
}

/**
 * Creates a CliError tagged as a not-found error with exit code NOT_FOUND.
 */
export function notFoundError(message: string): CliError {
  return new CliError(message, { code: 'E_NOT_FOUND', exitCode: EXIT_CODES.NOT_FOUND });
}

export const KNOWN_COMMANDS = ['info', 'check', 'doctor', 'debug', 'strand', 'materialize', 'seek', 'query', 'path', 'history', 'verify-audit', 'verify-index', 'reindex', 'trust', 'patch', 'tree', 'bisect', 'install-hooks'];

const BASE_OPTIONS = {
  repo:   { type: 'string', short: 'r' },
  json:   { type: 'boolean', default: false },
  ndjson: { type: 'boolean', default: false },
  view:   { type: 'string' },
  graph:  { type: 'string' },
  writer: { type: 'string', default: 'cli' },
  help:   { type: 'boolean', short: 'h', default: false },
} as const;

/**
 * Pre-processes argv to handle --view's optional-value semantics.
 * If --view is followed by a command name or flag (or is last), injects 'ascii'.
 * Validates the view mode value.
 *
 * When --view is passed without a value, we inject 'ascii' as the default.
 * This happens before validation so the downstream parser sees a concrete
 * value. The synthetic injection is intentional — parseArgs requires --view
 * to have a value even though the CLI allows bare --view.
 */
function preprocessView(argv: string[]): string[] {
  const idx = argv.indexOf('--view');
  if (idx === -1) {
    return argv;
  }
  const next = argv[idx + 1];
  const needsDefault = next === undefined || next === '' || next.startsWith('-') || KNOWN_COMMANDS.includes(next);
  if (needsDefault) {
    return [...argv.slice(0, idx + 1), 'ascii', ...argv.slice(idx + 1)];
  }
  const validModes = ['ascii'];
  const validPrefixes = ['svg:', 'html:'];
  const isValid = validModes.includes(next) ||
    validPrefixes.some((prefix) => next.startsWith(prefix));
  if (!isValid) {
    throw usageError(`Invalid view mode: ${next}. Valid modes: ascii, svg:FILE, html:FILE`);
  }
  return argv;
}

/** String flags that always consume a value argument */
const BASE_STRING_FLAGS = new Set(['--repo', '-r', '--graph', '--writer']);
/** Boolean flags (no value) */
const BASE_BOOL_FLAGS = new Set(['--json', '--ndjson', '--help', '-h']);

/**
 * Checks if a value looks like it belongs to --view (not a flag or command).
 */
function isViewValue(next: string | undefined): boolean {
  if (next === undefined || next === '' || next.startsWith('-') || KNOWN_COMMANDS.includes(next)) {
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
 */
function extractBaseArgs(argv: string[]): { baseArgs: string[]; command: string | undefined; commandArgs: string[] } {
  const baseArgs: string[] = [];
  const rest: string[] = [];
  let command: string | undefined;
  // Phase 1: Pre-command — scan for base flags (--repo, --json, --view, etc.)
  let pastCommand = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined || arg === null) { continue; }

    if (arg === '--') {
      rest.push(...argv.slice(i + 1));
      break;
    }

    if (BASE_STRING_FLAGS.has(arg)) {
      baseArgs.push(arg);
      if (i + 1 < argv.length) {
        const next = argv[++i];
        if (next !== undefined && next !== null) { baseArgs.push(next); }
      }
      continue;
    }

    // Handle --flag=value form for string flags
    if (arg.startsWith('--') && BASE_STRING_FLAGS.has(arg.split('=')[0] ?? '')) {
      baseArgs.push(arg);
      continue;
    }

    // --view has optional-value semantics: consume next only if it looks like a view mode
    if (arg === '--view') {
      baseArgs.push(arg);
      const peek = argv[i + 1];
      if (peek !== undefined && peek !== null && isViewValue(peek)) {
        i++;
        baseArgs.push(peek);
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

    if (pastCommand) {
      // Phase 2: Post-command — remaining args are command-specific, stop scanning
      rest.push(arg);
      continue;
    }

    if (!arg.startsWith('-')) {
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
 */
export function parseArgs(argv: string[]): { options: CliOptions; command: string | undefined; commandArgs: string[] } {
  const { baseArgs, command, commandArgs } = extractBaseArgs(argv);
  const processed = preprocessView(baseArgs);

  let parsed: { values: Record<string, string | boolean | string[] | boolean[] | undefined>; positionals: string[] };
  try {
    parsed = nodeParseArgs({
      args: processed,
      options: BASE_OPTIONS as ParseArgsConfig['options'],
      strict: true,
      allowPositionals: false,
    });
  } catch (err) {
    throw usageError(err instanceof Error ? err.message : String(err));
  }

  const values = parsed.values as { repo?: string; json?: boolean; ndjson?: boolean; view?: string; graph?: string; writer?: string; help?: boolean };

  const options: CliOptions = {
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
 */
export function parseCommandArgs<T>(
  args: string[],
  config: Record<string, { type: string; short?: string; default?: unknown; multiple?: boolean }>,
  schema: ZodType<T, ZodTypeDef, unknown>,
  { allowPositionals = false }: { allowPositionals?: boolean } = {},
): { values: T; positionals: string[] } {
  let parsed: { values: Record<string, string | boolean | string[] | boolean[] | undefined>; positionals: string[] };
  try {
    parsed = nodeParseArgs({
      args,
      options: config as ParseArgsConfig['options'],
      strict: true,
      allowPositionals,
    });
  } catch (err) {
    throw usageError(err instanceof Error ? err.message : String(err));
  }

  const result = schema.safeParse(parsed.values);
  if (!result.success) {
    const msg = result.error.issues.map((issue: { message: string }) => issue.message).join('; ');
    throw usageError(msg);
  }

  return { values: result.data, positionals: parsed.positionals.length > 0 ? parsed.positionals : [] };
}
