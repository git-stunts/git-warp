# Graft — Phase 1: The Governor

**Cycle:** 0003-safe-context
**Type:** Feature (new repo: `@flyingrobots/graft`)
**Pulled from:** `asap/DX_safe-context-phase-1.md`
**Prior art:** `docs/design/0002-code-nav-tool/code-nav-tool.md`

**Product:** `graft` — structural reads and context governance for
coding agents. CLI as `git graft`, MCP as `graft-mcp`.

The name: Git has trees and branches. Grafting is attaching new
growth onto existing rootstock — semantic eyesight grafted onto
Git's history substrate.

## Sponsor human

James — maintains JS/TS and Rust codebases. Has empirical proof
(Blacklight, 1,091 sessions) that Read context burden is the
dominant cost in agentic coding. Wants a tool that enforces
replay-safe behavior across Claude Code, Gemini CLI, and Codex CLI
without requiring agents to be disciplined on their own.

## Sponsor agent

Claude — 96.2 GB of Read context burden. 58% full-file reads. 64.5%
exploration reads that never lead to an edit. Needs a policy layer
that prevents it from stuffing its own context with gravel, and
structural extraction that makes the policy usable instead of
obnoxious.

## Hill

An agent working in a JS/TS codebase can obtain the minimum
structurally correct context required to act — file shape, export
surface, or bounded source range — without injecting large raw
artifacts into long-lived conversation state. The tool runs as an
MCP server and CLI and enforces replay-safe behavior by default.

Phase 1 scope: JS/TS only. `safe_read`, `file_outline`,
`read_range`, `run_capture`, `state_save`/`state_load`. No
`code_show` or `code_find` yet (Phase 2).

## Playback questions

### Agent

1. When I `safe_read` a 2000-line JS file, do I get an outline
   instead of raw content? **YES/NO**
2. When I `safe_read` a 50-line config file, do I get the raw
   content? **YES/NO**
3. Am I blocked from reading `.gif`, `.png`, `.wasm`, and
   `node_modules/`? **YES/NO**
4. Does `run_capture("npm test")` return only the tail, with full
   output on disk? **YES/NO**
5. Can I `state_save` before a `/clear` and `state_load` after?
   **YES/NO**
6. Can I call every operation as an MCP tool from Claude Code?
   **YES/NO**
7. When I outline a half-edited file with broken syntax, do I get
   a best-effort outline with `partial: true`? **YES/NO**

### Human

1. Can I `npm install -g @flyingrobots/graft` and it works?
   **YES/NO**
2. Does `git graft outline src/domain/services/StrandService.js`
   return a useful structural skeleton from the CLI? **YES/NO**
3. Can I point it at any JS/TS project with zero config? **YES/NO**
4. Can I register it as an MCP server in one line of JSON? **YES/NO**

## Non-goals

- Rust support (Phase 2)
- `code_show` / `code_find` / `exports` (Phase 2)
- Persistent whole-repo index
- Cross-file reference resolution
- Code modification
- LSP replacement
- Semantic type resolution
- Session tripwires and auto-nudges (Phase 3)

## Command contracts

### `safe_read(path, intent?)`

**Input:**
- `path` — file path (absolute or relative to project root)
- `root` — optional project root override
- `intent` — optional string hint ("understand shape", "find
  method X", "edit line 45")

**Policy decisions:**

| Condition | Response |
|---|---|
| Binary extension (`.gif`, `.png`, `.jpg`, `.pdf`, `.zip`, `.wasm`, `.bin`, `.sqlite`, `.ico`, `.mp4`, `.mov`) | Refuse. Return file type + size metadata. |
| Build/generated path (`node_modules/`, `dist/`, `build/`, `.next/`, `target/`, `coverage/`) | Refuse. No source-path guessing — just state what was blocked and why. |
| File does not exist | Error (not a refusal — see error model below). |
| Secret file (`.env`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `credentials.json`) | Refuse. Built-in, not `.graftignore`-dependent. |
| File <= line threshold AND <= byte threshold | Return raw content. |
| File > either threshold | Return `file_outline` result + next-step hints. |
| Known junk patterns (`.min.js`, lockfiles, giant JSON) | Refuse. Return metadata only. |

**Thresholds (configurable):**

| Metric | Default |
|---|---|
| Max lines | 150 |
| Max bytes | 12 KB |

Both must pass for raw content. A 40-line minified atrocity that's
50 KB still gets outlined. Lockfiles (`package-lock.json`,
`pnpm-lock.yaml`, `yarn.lock`) and `.min.js` files are always
refused regardless of size.

**Intent is advisory only.** It may affect messaging and next-step
hints. It never weakens safety bounds. An agent saying "edit line
45" does not unlock a larger read.

**Action model:**

| Action | Meaning |
|---|---|
| `content` | Raw file returned (under thresholds) |
| `outline` | Structural skeleton returned (over thresholds) |
| `refused` | Policy blocked the read (binary, build, secret, graftignore) |
| `error` | Operational failure (missing file, unreadable, bad path) |

`refused` = the governor said no. `error` = something broke. These
are different: a refusal is correct behavior; an error is a problem.

**Output shape:**
```json
{
  "action": "content" | "outline" | "refused" | "error",
  "path": "src/foo.js",
  "lines": 2048,
  "bytes": 68402,
  "content": "..." | null,
  "outline": { ... } | null,
  "reason": "over_line_threshold" | "binary_extension" | ... | null,
  "explain": "File exceeded 150-line cap; outline returned instead." | null,
  "policy": { "lineThreshold": 150, "byteThreshold": 12000, "triggeredBy": "over_line_threshold" } | null,
  "next": ["read_range(path, 1240, 1271) for method tick"] | null,
  "savings": { "bytesAvoided": 68402 } | null
}
```

### `file_outline(path)`

**Input:** file path.

**Output:** structural skeleton of the file.

**Formatting bounds:**
- Parameter strings truncated at 60 chars (ellipsized)
- Default values and destructuring patterns compacted
- Generic type parameters summarized, not expanded
- Max 80 chars per signature line
- Output capped at 200 entries (declarations + members). If a file
  has more, the tail is elided with metadata:

```json
{
  "entryCount": 200,
  "totalEntryCount": 317,
  "truncated": true,
  "elidedCount": 117
}
```

**Broken files (syntactically invalid JS/TS):**

Agents constantly work on half-edited, mid-refactor files. This is
normal, not an error. Tree-sitter produces partial parse trees for
broken syntax — it does not bail.

Contract: outline is **best-effort**. If the file has parse errors,
the outline includes whatever structure tree-sitter recovered, plus
metadata:

```json
{
  "partial": true,
  "parseErrors": [
    { "line": 188, "message": "unterminated class body" }
  ]
}
```

The outline is still useful — it shows the symbols that parsed
cleanly. The `partial` flag tells the agent "this file is broken,
so the outline may be incomplete." This is strictly better than
refusing to outline a broken file.

**Root parameter:** `file_outline(path, { root?, focus? })`

`root` overrides project root detection for this call. `focus`
limits output to a single class or top-level declaration by name.

```json
{
  "path": "src/domain/services/StrandService.js",
  "lines": 2048,
  "language": "javascript",
  "exports": [
    { "name": "STRAND_SCHEMA_VERSION", "kind": "const", "line": 89 },
    { "name": "default", "kind": "class", "alias": "StrandService", "line": 901 }
  ],
  "declarations": [
    { "name": "compareStrings", "kind": "function", "line": 100, "endLine": 102 },
    { "name": "normalizeCreateOptions", "kind": "function", "line": 245, "endLine": 308 }
  ],
  "classes": [
    {
      "name": "StrandService",
      "line": 901,
      "endLine": 2048,
      "members": [
        { "name": "constructor", "kind": "method", "line": 907, "params": "{ graph }" },
        { "name": "create", "kind": "method", "line": 917, "async": true, "params": "options = {}" },
        { "name": "braid", "kind": "method", "line": 952, "async": true, "params": "strandId, options = {}" },
        { "name": "get", "kind": "method", "line": 985, "async": true, "params": "strandId" },
        { "name": "tick", "kind": "method", "line": 1240, "async": true, "params": "strandId" },
        { "name": "_buildRef", "kind": "method", "line": 1563, "params": "strandId", "private": true }
      ]
    }
  ]
}
```

**CLI text output:**

```
src/domain/services/StrandService.js (2048 lines, javascript)

  exports:
    const STRAND_SCHEMA_VERSION                       :89
    default class StrandService                       :901

  functions:
    compareStrings(a, b)                              :100-102
    normalizeCreateOptions(options)                    :245-308
    ...

  class StrandService                                 :901-2048
    constructor({ graph })                            :907
    async create(options = {})                        :917
    async braid(strandId, options = {})               :952
    async get(strandId)                               :985
    async list()                                      :1000
    async drop(strandId)                              :1024
    async materialize(strandId, options = {})          :1055
    async createPatchBuilder(strandId)                 :1076
    async patch(strandId, build)                       :1134
    async queueIntent(strandId, build)                 :1165
    async listIntents(strandId)                        :1207
    async tick(strandId)                               :1240
    async getPatchEntries(strandId, options = {})       :1505
    async patchesFor(strandId, entityId, options = {})  :1520
    async getOrThrow(strandId)                         :1545
    _buildRef(strandId)                                :1563  [private]
    _buildOverlayRef(strandId)                         :1582  [private]
    _buildBraidPrefix(strandId)                        :1601  [private]
    _buildBraidRef(strandId, braidedStrandId)           :1621  [private]
    _readDescriptorByOid(oid, strandId)                :1642  [private]
    _writeDescriptor(descriptor)                       :1677  [private]
    _loadBraidedReadOverlays(target, braidedStrandIds)  :1693  [private]
    _readOverlayMetadata(strandId)                     :1724  [private]
    _hydrateOverlayMetadata(descriptor)                :1744  [private]
    _collectBasePatches(descriptor)                     :1781  [private]
    _collectOverlayPatches(descriptor)                  :1813  [private]
    _collectBraidedOverlayPatches(descriptor)           :1827  [private]
    _collectPatchEntries(descriptor, { ceiling })       :1850  [private]
    _materializeDescriptor(descriptor, opts)            :1881  [private]
    _syncOverlayDescriptor(descriptor, { patch, sha })  :1936  [private]
    _commitQueuedPatch(params)                         :1973  [private]
    _syncBraidRefs(strandId, readOverlays)              :2027  [private]
```

That is 35 lines. Not 2048.

### `read_range(path, start, end)`

**Input:** file path, start line (1-indexed), end line (inclusive),
optional `root` override.

**Output:** raw content of the specified range with line numbers.

**Bounded.** The governor still governs:

| Constraint | Default |
|---|---|
| Max line span | 250 lines |
| Max byte output | 20 KB |

If the requested range exceeds either cap, the response is clipped
and metadata shows what happened:

```json
{
  "path": "src/foo.js",
  "requested": { "start": 1, "end": 800 },
  "returned": { "start": 1, "end": 250 },
  "truncated": true,
  "reason": "range_exceeds_max_lines",
  "content": "..."
}
```

Binary and build-path bans still apply. `read_range("foo.gif", 1, 10)`
is still refused.

This is a scoped read, not a policy bypass.

### `run_capture(cmd, tail?)`

**Input:**
- `cmd` — shell command string
- `tail` — number of lines to return (default 60)
- `cwd` — working directory (default: project root)
- `timeout` — max seconds (default: 120)

**Behavior:**
1. Execute `cmd` via the user's default shell
2. Tee full output (stdout + stderr merged) to a log file
3. Return last `tail` lines + the log file path
4. Return exit code

**Execution contract:**

| Setting | Value |
|---|---|
| Working directory | Project root (or explicit `cwd` param) |
| Environment | Inherited from parent process |
| Timeout | 120 seconds default (configurable via `timeout` param) |
| Max log size | 5 MB. If output exceeds this, the log is truncated from the head and the tail is preserved. |
| Nonzero exit | Not an error — return the exit code + tail normally. Tests fail; that's expected. |

**Output shape:**
```json
{
  "exitCode": 1,
  "tail": "... last 60 lines ...",
  "logFile": ".graft/logs/capture-1712023456.log",
  "totalLines": 342,
  "truncated": true
}
```

Agent can `read_range` the log file if it needs more.

### `state_save(content)` / `state_load()`

**Input (save):** markdown string of session state.
**Output (load):** the saved content, or null if no state file.

**Storage:** `.graft/WORKING_STATE.md` in the project root.

**Capped at 8 KB.** If content exceeds the cap, the save is
rejected with `reason: "state_exceeds_max_bytes"`. The agent must
be concise. This is a breadcrumb trail, not a second context
window.

Recommended template (not enforced, but nudged in error messages):

```markdown
# Task
# Current hypothesis
# Files touched
# Next 3 actions
# Open questions
```

The human can read it with `cat`. The agent can load it after
`/clear` and pick up where it left off.

## `.graftignore`

A gitignore-style file in the project root. Paths matching any
pattern are always refused by `safe_read` and `read_range`, with
`reason: "graftignore"`.

```text
# Secrets
.env
.env.*
credentials.json
**/secrets/**

# Large generated files
*.sql.dump
*.csv
data/

# Project-specific
src/generated/**
```

If `.graftignore` does not exist, only the built-in bans (binary
extensions, build paths, lockfiles, minified) apply. The file is
optional — graft works without it.

Uses `.gitignore` glob syntax via `picomatch` (declared dependency,
not transitive — don't build product behavior on accidental dep
chains).

## Project root

All paths are resolved relative to the project root. Detection
order:

1. Explicit `--root` flag (CLI) or `root` param (MCP)
2. Nearest ancestor directory containing `.git/`
3. Current working directory (fallback)

**Rules:**
- Symlinks are resolved before path checks
- Paths that escape the project root are refused
  (`reason: "path_escapes_root"`)
- Temp log files from `run_capture` live in `.graft/logs/` inside
  the project root, not `/tmp/`
- `.graft/` should be added to `.gitignore`

## Reason codes

All policy decisions use machine-stable enum strings, not prose.

| Code | Trigger |
|---|---|
| `binary_extension` | File has banned extension |
| `generated_path` | Path matches build/generated pattern |
| `lockfile` | `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock` |
| `minified` | `.min.js`, `.min.css` |
| `over_line_threshold` | Lines exceed safe_read threshold |
| `over_byte_threshold` | Bytes exceed safe_read threshold |
| `range_exceeds_max_lines` | read_range span too large |
| `range_exceeds_max_bytes` | read_range output too large |
| `state_exceeds_max_bytes` | state_save content too large |
| `path_escapes_root` | Path resolves outside project root |
| `secret_file` | Built-in secret ban (`.env`, `*.pem`, etc.) |
| `graftignore` | Path matches `.graftignore` pattern |
| `missing_file` | File does not exist |

## Technology

### Tree-sitter

- `tree-sitter` npm package (native addon)
- `tree-sitter-javascript` grammar (covers JS + JSX)
- `tree-sitter-typescript` grammar (covers TS + TSX)
- Parses any file in single-digit ms
- No persistent process needed — parse on demand

### MCP

- `@modelcontextprotocol/sdk` for server implementation
- stdio transport (standard for all three LLM agents)
- One tool definition per command

### Runtime

- Node.js >= 20 (tree-sitter native addon)
- Zero config — no tsconfig, no build step, no daemon
- `pnpm` for package management

### Install and binary names

```bash
npm install -g @flyingrobots/graft
```

This installs two binaries:

| Binary | Purpose |
|---|---|
| `graft` | Standalone CLI (`graft outline foo.js`) |
| `git-graft` | Git subcommand shim (`git graft outline foo.js`) |

Git automatically finds `git-graft` on `$PATH` and exposes it as
`git graft`. Both binaries are the same entrypoint.

MCP server is started via:

```bash
graft mcp
```

Claude Code config:

```json
{
  "mcpServers": {
    "graft": {
      "command": "graft",
      "args": ["mcp"]
    }
  }
}
```

## Project structure

```text
graft/
  bin/
    graft.js            CLI entry point
  src/
    policy/
      rules.js                 Ban lists, thresholds
      gate.js                  Decision engine
    parser/
      index.js                 Tree-sitter init + grammar loading
      javascript.js            JS/TS/TSX outline extraction
    operations/
      safe-read.js             Policy-enforced read
      outline.js               Structural skeleton
      range.js                 Bounded reads
      capture.js               Shell output tailing
      state.js                 Session state save/load
    hooks/
      gate.js                  Hook enforcement (Read gate, Bash gate)
    mcp/
      server.js                MCP server (stdio)
      tools.js                 Tool definitions + handlers
    format/
      text.js                  CLI text formatter
      json.js                  JSON output formatter
    metrics/
      logger.js                NDJSON decision logger
      stats.js                 Summary stats from log
  test/
    fixtures/
      small.js                 Under both thresholds (pass-through)
      large-class.js           Over line threshold (outline)
      wide-minified.js         Under lines, over bytes (outline)
      huge-file.js             300+ declarations (outline cap test)
      plain-functions.js       Top-level functions only
      typescript.ts            TS-specific constructs
      binary.gif               Binary refusal
      vendor.min.js            Minified refusal
      broken-syntax.js         Partial parse (missing braces)
      secret.env               Secret file refusal
      generated/               Build path refusal
    unit/
      policy.test.js           Gate decisions
      outline.test.js          Structural extraction
      safe-read.test.js        Integration (policy + extraction)
      capture.test.js          Shell capture
      state.test.js            State save/load
    integration/
      mcp.test.js              MCP server round-trip
  package.json
  LICENSE                      Apache 2.0
  README.md
```

## Test strategy

Tests are the spec. Playback questions map directly to test cases.

### Policy tests (`policy.test.js`)

```
safe_read("foo.gif")              -> refused, reason: binary_extension
safe_read("node_modules/x.js")    -> refused, reason: generated_path
safe_read("dist/bundle.js")       -> refused, reason: generated_path
safe_read("package-lock.json")    -> refused, reason: lockfile
safe_read("vendor.min.js")        -> refused, reason: minified
safe_read("small.js")             -> content (under both thresholds)
safe_read("large-class.js")       -> outline (over line threshold)
safe_read("wide-minified.js")     -> outline (under lines, over bytes)
safe_read("missing.js")           -> error, reason: missing_file
safe_read("../../etc/passwd")     -> refused, reason: path_escapes_root
safe_read("/tmp -> ../../etc")    -> refused (symlink resolved, escapes root)
safe_read(".env")                 -> refused, reason: secret_file (built-in, no .graftignore needed)
safe_read(".env.production")      -> refused, reason: secret_file
safe_read("deploy.pem")           -> refused, reason: secret_file
safe_read("data/dump.csv")        -> refused, reason: graftignore (with .graftignore)
safe_read(bigFile, intent="edit") -> outline (intent does NOT relax policy)
safe_read("missing.js")           -> action: error, reason: missing_file

read_range("foo.js", 1, 800)      -> truncated to 250 lines
read_range("foo.js", 1, 100)      -> exact range returned
read_range("foo.gif", 1, 10)      -> refused, reason: binary_extension

state_save("# short")             -> saved
state_save("x".repeat(9000))      -> refused, reason: state_exceeds_max_bytes
state_load() after save            -> returns saved content
state_load() with no prior save    -> returns null
```

### Outline tests (`outline.test.js`)

```
outline("large-class.js")
  -> has exports array
  -> has classes array with members
  -> members have name, kind, line, params
  -> async methods marked async: true
  -> private methods (leading _) marked private: true
  -> no function bodies in output
  -> line numbers are accurate (spot-check)
  -> params truncated at 60 chars when long
  -> total entries <= 200

outline("plain-functions.js")
  -> has declarations array
  -> each has name, kind, line, endLine

outline("typescript.ts")
  -> handles interfaces, type aliases, enums
  -> handles decorated classes

outline("huge-file-300-functions.js")
  -> entries capped at 200
  -> tail elided with elidedCount: 100+

outline("broken-syntax.js")
  -> partial: true
  -> parseErrors array present
  -> recovered symbols still included
  -> still useful, not an error

outline("large-class.js", { focus: "StrandService" })
  -> only StrandService members returned
  -> other classes/functions excluded
```

### Capture tests (`capture.test.js`)

```
run_capture("echo hello", 10)
  -> exitCode: 0
  -> tail contains "hello"
  -> logFile exists on disk
  -> logFile contains "hello"

run_capture("seq 1 500", 5)
  -> tail contains lines 496-500
  -> truncated: true
  -> totalLines: 500
  -> logFile contains all 500 lines
```

### State tests (`state.test.js`)

```
state_save("# Working on X")
  -> file exists at .graft/WORKING_STATE.md
  -> content matches

state_load()
  -> returns saved content

state_load() with no prior save
  -> returns null
```

### MCP integration tests (`mcp.test.js`)

```
spawn MCP server via stdio
  -> server lists all tools
  -> safe_read call returns valid response
  -> file_outline call returns valid response
  -> run_capture call returns valid response
  -> state_save + state_load round-trips
```

## Enforcement: hooks

The MCP server is voluntary. The agent can still call native `Read`
and bypass the governor entirely. And it will — not maliciously,
just because `Read` is familiar and consequences are later.

The research says it plainly:

> Models often "agree and then ignore" instruction-only rules.
> Enforcement is stronger.

So graft ships **two layers**:

### Layer 1: MCP server (cross-LLM, voluntary)

The tools described above. Works on Claude Code, Gemini CLI,
Codex CLI. Agent uses these instead of native Read/Bash. Relies on
project instructions (CLAUDE.md, GEMINI.md) to prefer graft tools.

### Layer 2: Claude Code hooks (enforced)

`PreToolUse` hooks intercept native tool calls and route them
through graft's policy gate.

**Read hook:**

When the agent calls native `Read`, the hook:

1. Runs the path through graft's policy (binary? build? over
   threshold?)
2. If policy says **content** (small, safe): allow the Read through
   unchanged
3. If policy says **outline** (too large): block the Read, return
   the outline as the tool result with next-step hints
4. If policy says **refused** (binary, build, lockfile): block the
   Read, return the reason and metadata

The agent never sees the raw 2000-line file. It gets the outline
and can follow up with `read_range` for specific sections.

**Bash hook (test capture):**

When the agent calls native `Bash` with a command matching known
test runners (`npm test`, `vitest`, `jest`, `cargo test`, `pytest`,
`make test`), the hook:

1. Routes through `run_capture` instead
2. Tees full output to `.graft/logs/`
3. Returns only the tail

The agent gets the test result without the full dump. The full
output is on disk if needed.

**Hook configuration:**

Graft ships a `graft hooks install` command that writes the hook
config. For Claude Code:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Read",
        "command": "graft gate read"
      },
      {
        "matcher": "Bash",
        "command": "graft gate bash"
      }
    ]
  }
}
```

The `graft gate` subcommands read the tool call input from stdin
(hook protocol), apply policy, and exit 0 (allow) or exit 2
(block + replacement output).

**Gemini/Codex:** No equivalent hook mechanism yet. Enforcement is
MCP-only + project instructions. When those agents add hooks, graft
adapts.

## Additional commands

### `graft doctor`

Diagnostic command for debugging policy behavior.

```bash
git graft doctor
```

```
project root:     /Users/james/git/git-stunts/git-warp (.git detected)
line threshold:    150
byte threshold:    12,000
range max lines:   250
range max bytes:   20,000
state max bytes:   8,192
log directory:     .graft/logs/ (exists, 3 files, 42 KB)
state file:        .graft/WORKING_STATE.md (exists, 1.2 KB)
parser:            tree-sitter (javascript, typescript loaded)
node version:      v22.3.0
hooks installed:   yes (Read gate, Bash gate)
.graftignore:      present (7 patterns)
.gitignore:        .graft/ present
```

Answers "why did my read get blocked?" before anyone has to ask.

### `graft stats`

Minimal decision metrics. Not a dashboard — a quick summary.

```bash
git graft stats
```

```
session decisions (since last clear):
  content:   12 reads passed through
  outline:    8 reads downgraded to outline
  refused:    3 reads blocked (2 binary, 1 generated)
  ranges:     5 bounded reads
  captures:   4 shell captures (avg 47 tail lines)

estimated bytes avoided: ~340 KB
```

Graft logs every decision to `.graft/metrics.jsonl` as append-only
NDJSON. One line per decision. This is how we prove graft works
when Blacklight re-analyzes post-deployment.

```json
{"ts":"...","op":"safe_read","action":"outline","path":"StrandService.js","lines":2048,"bytes":68402,"reason":"over_line_threshold"}
{"ts":"...","op":"read_range","path":"StrandService.js","start":1240,"end":1271,"truncated":false}
{"ts":"...","op":"safe_read","action":"refused","path":"foo.gif","reason":"binary_extension"}
```

**Log retention:**
- `metrics.jsonl`: max 1 MB. When exceeded, oldest entries are
  pruned (keep the tail).
- `.graft/logs/` (capture logs): max 10 MB total. Oldest logs
  pruned first. Individual capture logs capped at 5 MB.
- `graft stats --since-clear` resets the metric window.

`graft doctor` and `graft stats` both accept `--json` for machine
consumption.

## Parse cache

Tree-sitter is fast, but the MCP server lives for the session
duration. If the same file is outlined twice, cache the parse tree.

`Map<path, { mtime, tree }>` — invalidated by mtime change.
In-memory only, no persistence. This matters because the agent will
outline a file, read a range, then outline again to re-orient.

## Smart next-step hints

When `safe_read` returns an outline, the `next` array references
specific symbols by name, not generic suggestions. If the outline
shows a class with 25 methods, the hints name the public methods
and their line ranges:

```json
"next": [
  "read_range(path, 917, 950) — create()",
  "read_range(path, 1240, 1271) — tick()",
  "file_outline(path, { focus: 'StrandService' }) — just this class"
]
```

When `intent` mentions a symbol name and it appears in the outline,
that symbol's range is promoted to the first hint.

## Estimated savings

Every graft response that avoids returning raw content includes:

```json
"savings": { "bytesAvoided": 68402 }
```

Not rigorous. Perfect for a README. Makes the value visible on
every call — agent and human both see "this outline saved 68 KB."
