# safe-context Phase 1 — The Governor

**Cycle:** 0003-safe-context
**Type:** Feature (new repo: `@git-stunts/safe-context`)
**Pulled from:** `asap/DX_safe-context-phase-1.md`
**Prior art:** `docs/design/0002-code-nav-tool/code-nav-tool.md`

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

### Human

1. Can I `npm install -g @git-stunts/safe-context` and it works?
   **YES/NO**
2. Does `safe-context outline src/domain/services/StrandService.js`
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
- `intent` — optional string hint ("understand shape", "find
  method X", "edit line 45")

**Policy decisions:**

| Condition | Response |
|---|---|
| Binary extension (`.gif`, `.png`, `.jpg`, `.pdf`, `.zip`, `.wasm`, `.bin`, `.sqlite`, `.ico`, `.mp4`, `.mov`) | Refuse. Return file type + size metadata. |
| Build/generated path (`node_modules/`, `dist/`, `build/`, `.next/`, `target/`, `coverage/`) | Refuse. Suggest source path. |
| File does not exist | Error with path. |
| File <= threshold (default 150 lines) | Return raw content. |
| File > threshold | Return `file_outline` result + "use read_range for details". |

The threshold is configurable. Default 150 lines balances the data:
most utility files, configs, and small modules pass through; god
objects and large services get outlined.

**Output shape:**
```json
{
  "action": "content" | "outline" | "refused",
  "path": "src/foo.js",
  "lines": 2048,
  "bytes": 68402,
  "content": "..." | null,
  "outline": { ... } | null,
  "reason": "..." | null
}
```

### `file_outline(path)`

**Input:** file path.

**Output:** structural skeleton of the file.

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

**Input:** file path, start line (1-indexed), end line (inclusive).

**Output:** raw content of the specified range with line numbers.

No policy interception — the caller already has a precise target.
This is the escape hatch when the agent knows exactly what it needs.

### `run_capture(cmd, tail?)`

**Input:**
- `cmd` — shell command string
- `tail` — number of lines to return (default 60)

**Behavior:**
1. Execute `cmd` via shell
2. Tee full output to a temp log file
3. Return last `tail` lines + the log file path
4. Return exit code

**Output shape:**
```json
{
  "exitCode": 1,
  "tail": "... last 60 lines ...",
  "logFile": "/tmp/safe-context/capture-1712023456.log",
  "totalLines": 342,
  "truncated": true
}
```

Agent can `read_range` the log file if it needs more.

### `state_save(content)` / `state_load()`

**Input (save):** markdown string of session state.
**Output (load):** the saved content, or null if no state file.

**Storage:** `.safe-context/WORKING_STATE.md` in the project root.

This is deliberately simple. A markdown file. No schema, no
structure enforcement. The agent writes what it needs to remember.
The human can read it with `cat`.

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

## Project structure

```text
safe-context/
  bin/
    safe-context.js            CLI entry point
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
    mcp/
      server.js                MCP server (stdio)
      tools.js                 Tool definitions + handlers
    format/
      text.js                  CLI text formatter
      json.js                  JSON output formatter
  test/
    fixtures/
      small.js                 Under threshold (pass-through)
      large-class.js           Over threshold (outline)
      binary.gif               Binary refusal
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
safe_read("foo.gif")          -> action: "refused"
safe_read("node_modules/x")   -> action: "refused"
safe_read("small.js")         -> action: "content" (under threshold)
safe_read("large-class.js")   -> action: "outline" (over threshold)
safe_read("missing.js")       -> error
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

outline("plain-functions.js")
  -> has declarations array
  -> each has name, kind, line, endLine

outline("typescript.ts")
  -> handles interfaces, type aliases, enums
  -> handles decorated classes
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
  -> file exists at .safe-context/WORKING_STATE.md
  -> content matches

state_load()
  -> returns saved content

state_load() with no prior save
  -> returns null
```

### MCP integration tests (`mcp.test.js`)

```
spawn MCP server via stdio
  -> server lists all 6 tools
  -> safe_read call returns valid response
  -> file_outline call returns valid response
  -> run_capture call returns valid response
  -> state_save + state_load round-trips
```
