# Code Nav: AST-Aware Symbol Extraction for LLM Agents

**Cycle:** 0002-code-nav-tool
**Type:** Feature (new repo)
**Legend:** n/a (standalone tool, not git-warp internal)

## Sponsor human

James — maintains JS/TS and Rust codebases. Wants an agent that can
work on 2000+ LOC files without reading every line. Wants a tool
that works across his two primary language families and integrates
into the Claude Code workflow via MCP.

## Sponsor agent

Claude — reads entire files to find 30-line functions. Burns context
window on irrelevant code. Needs to understand code structure before
making targeted edits. Current workflow: Grep for name → Read with
offset/limit → hope the offset is right → often over-read. A
structural extraction tool would cut context waste by 10-50x on
large files.

## Hill

An agent working in a JavaScript, TypeScript, or Rust codebase can
extract any named symbol's source code, see the structural outline
of any file, and find where symbols are defined — without reading
full files. The tool runs as both a CLI and an MCP server.

## Playback questions

### Agent

1. Can I get just the source code of `StrandService.tick()` without
   reading StrandService.js? **YES/NO**
2. Can I see the shape of a 2000-line file (all method signatures,
   no bodies) in under 50 lines of output? **YES/NO**
3. Can I find where `reduceV5` is defined across the codebase
   without multiple grep rounds? **YES/NO**
4. Does it work on `.js`, `.ts`, `.tsx`, `.rs` files? **YES/NO**
5. Can I call it as an MCP tool from Claude Code? **YES/NO**

### Human

1. Can I install it with one command? **YES/NO**
2. Does it work on any JS/TS or Rust project without configuration?
   **YES/NO**
3. Is it fast enough to not interrupt flow (<100ms per query)?
   **YES/NO**
4. Can I use it from the terminal as a CLI too? **YES/NO**

## Non-goals

- Replacing LSP / IDE features (go-to-definition with full type
  resolution, refactoring, diagnostics)
- Type inference or type checking
- Modifying code (this is read-only extraction)
- Supporting every language (JS/TS + Rust covers the need)
- Maintaining a persistent index or daemon process
- Replacing grep for text search — this is structural, not textual

## Before and after

Real scenarios from working on git-warp. Token counts are estimates
based on ~3.5 tokens per line of JavaScript.

### Scenario 1: "Understand a god object before decomposing it"

**Task:** Plan the StrandService decomposition. Need to know what
methods exist, how they group, and which are public vs private.

**Before (today):**

```
Read StrandService.js (lines 1-100)       →  ~350 tokens (imports, typedefs)
Read StrandService.js (lines 100-200)     →  ~350 tokens (validation helpers)
  ... still no class body ...
Read StrandService.js (lines 900-1070)    →  ~595 tokens (class start, create/braid/get/list/drop)
Read StrandService.js (lines 1070-1320)   →  ~875 tokens (createPatchBuilder, patch, queueIntent, listIntents)
Read StrandService.js (lines 1320-1560)   →  ~840 tokens (tick internals, getPatchEntries, patchesFor)
Read StrandService.js (lines 1560-1930)   →  ~1295 tokens (private helpers, materialization)
Read StrandService.js (lines 1930-2048)   →  ~413 tokens (commit, sync refs)
```

**Total: 7 tool calls, ~4718 tokens of context consumed.** And most
of that is method bodies I don't need yet — I just wanted the shape.
The 7 sequential reads also cost wall-clock time (~3-5 seconds of
tool roundtrips).

**After (with code-nav):**

```
code_outline StrandService.js             →  ~50 lines, ~175 tokens
```

One call. Every method name, its parameters, and its line number.
Enough to plan the decomposition. When I need the body of a specific
method, one more call:

```
code_show StrandService.tick              →  ~32 lines, ~112 tokens
```

**Total: 1-2 tool calls, ~175-287 tokens.** That's a **94% reduction
in context consumed** and the information density is higher — pure
signal, no noise.

### Scenario 2: "Fix a bug in one method of a large class"

**Task:** `_commitQueuedPatch` in StrandService is using the wrong
tree structure. Need to read just that method, fix it, and move on.

**Before:**

```
Grep for '_commitQueuedPatch'             →  1 tool call, get line number (1973)
Read StrandService.js (lines 1960-2015)   →  ~192 tokens
  ... but I'm guessing at the method boundary.
  Did I get the whole thing? Is the JSDoc above line 1960?
Read StrandService.js (lines 1930-2015)   →  ~297 tokens (re-read with more context)
```

**Total: 3 tool calls, ~297 tokens used** (with 192 wasted on the
first imprecise read). And I had to eyeball where the method ends.

**After:**

```
code_show StrandService._commitQueuedPatch  →  exact method, ~140 tokens
```

**Total: 1 tool call, ~140 tokens.** Exact boundaries, including
the JSDoc. No guessing. **53% reduction**, but more importantly:
zero wasted reads and zero risk of missing the top or bottom of the
method.

### Scenario 3: "What does this module export? What can I use?"

**Task:** Wire up a new service that needs to import from
JoinReducer.js. What's available?

**Before:**

```
Grep for 'export' in JoinReducer.js       →  1 tool call, noisy (matches 'export' in comments too)
Read JoinReducer.js (lines 1-50)          →  ~175 tokens (hope the exports are at the top)
  ... they're not all at the top, some are inline ...
Read JoinReducer.js (lines 280-320)       →  ~140 tokens (found another export)
Grep for '^export' in JoinReducer.js      →  1 tool call, better but still need context
```

**Total: 4 tool calls, ~315+ tokens, incomplete picture.**

**After:**

```
code_exports JoinReducer.js               →  ~8 lines, ~40 tokens
```

**Total: 1 tool call, ~40 tokens.** Complete, structured, every
export with its type (function/class/const) and line number.
**87% reduction.**

### Scenario 4: "Where is this function defined?"

**Task:** `reduceV5` is called in 15 files. I need the definition,
not the call sites.

**Before:**

```
Grep for 'reduceV5' (files_with_matches)  →  1 tool call, 15 files
Grep for 'function reduceV5'              →  1 tool call, maybe finds it
  ... but what if it's `const reduceV5 = ` or `export { reduceV5 }`?
Grep for 'reduceV5' with context in likely file  →  1 tool call, ~100 tokens
```

**Total: 2-3 tool calls, up to ~100 tokens, fragile.** The pattern
depends on the declaration style.

**After:**

```
code_find reduceV5                        →  1 line, ~15 tokens
```

**Total: 1 tool call, ~15 tokens.** Returns only the definition,
regardless of whether it's `function`, `const`, `class`, or
re-export. **85% reduction.**

### Scenario 5: "I need to understand 8 files before a refactor"

**Task:** Decompose WarpRuntime. Need the outline of WarpRuntime.js
(683 LOC), StrandService.js (2048 LOC), SyncController.js (680 LOC),
WarpGraph.js (800 LOC), Writer.js, PatchSession.js, Observer.js
(575 LOC), CheckpointService.js (567 LOC).

**Before:**

This is where the compounding cost hits. Reading 8 files at even
50% coverage:

```
~5353 total LOC × 0.5 coverage × 3.5 tokens/line = ~9,368 tokens
~24 tool calls (3 reads per file average)
```

That's **9,368 tokens of context** before writing a single line of
code. In a 200K token context window, that's ~5% consumed just on
orientation. And it compounds — as the conversation continues,
those 9K tokens of file contents push earlier context (my own
reasoning, your instructions, test output) toward the compression
boundary.

**After:**

```
8 × code_outline calls = 8 tool calls
8 × ~50 lines × 3.5 tokens/line = ~1,400 tokens
```

**Total: 8 tool calls, ~1,400 tokens.** Same structural
understanding. **85% reduction.** The context window stays clean for
actual work — reasoning, test output, edits.

### Summary

| Scenario | Before (tokens) | After (tokens) | Reduction | Tool calls saved |
|---|---|---|---|---|
| Understand god object | ~4,718 | ~175 | 96% | 6 |
| Fix one method | ~297 | ~140 | 53% | 2 |
| List module exports | ~315 | ~40 | 87% | 3 |
| Find a definition | ~100 | ~15 | 85% | 2 |
| Pre-refactor survey (8 files) | ~9,368 | ~1,400 | 85% | 16 |

**The compounding effect matters most.** A single `outline` call
saves ~4,500 tokens. But in a real session I do this 5-20 times —
reading files to understand context before acting. Over a full
session that's 20,000-90,000 tokens of saved context. That's the
difference between hitting the compression boundary mid-task (losing
earlier reasoning) and having room to finish cleanly.

The token savings also translate directly to speed. Fewer tool calls
= fewer round-trips = faster responses. An 8-file survey drops from
~24 sequential reads (~10 seconds of tool overhead) to 8 parallel
outline calls (~1 second).

### 1. `show <symbol>`

Extract a named symbol's complete source code.

```bash
# A top-level function
code-nav show reduceV5
# → file: src/domain/services/JoinReducer.js:142-198
# → full source of reduceV5()

# A class method
code-nav show StrandService.tick
# → file: src/domain/services/StrandService.js:1240-1271
# → full source of tick(), including JSDoc

# A struct and its impl block
code-nav show VersionVector
# → file: src/crdt/version_vector.rs:12-89
# → struct definition + impl block(s)

# Nested: a method on a Rust impl
code-nav show VersionVector.merge
# → just the merge() method from the impl block
```

**Resolution order:** If `show foo` is ambiguous (multiple files
define `foo`), return all matches with file paths. The caller picks.

**What "complete" means:**
- The full syntactic extent of the declaration (function body,
  class body, struct + impl, enum + impl)
- Leading doc comments / JSDoc attached to the declaration
- Decorators / attributes attached to the declaration
- NOT: surrounding whitespace, imports, other declarations

### 2. `outline <file>`

Structural skeleton of a file — every declaration with signature
but no body.

```bash
code-nav outline src/domain/services/StrandService.js
```

```
src/domain/services/StrandService.js (2048 lines)

  exports:
    STRAND_SCHEMA_VERSION = 1                          :89
    STRAND_COORDINATE_VERSION = 'frontier-lamport/v1'  :90
    STRAND_OVERLAY_KIND = 'patch-log'                  :91
    default class StrandService                        :901

  class StrandService:
    constructor({ graph })                             :907
    async create(options = {})                         :917
    async braid(strandId, options = {})                :952
    async get(strandId)                                :985
    async list()                                       :1000
    async drop(strandId)                               :1024
    async materialize(strandId, options = {})           :1055
    async createPatchBuilder(strandId)                  :1076
    async patch(strandId, build)                        :1134
    async queueIntent(strandId, build)                  :1165
    async listIntents(strandId)                         :1207
    async tick(strandId)                                :1240
    async getPatchEntries(strandId, options = {})        :1505
    async patchesFor(strandId, entityId, options = {})   :1520
    async getOrThrow(strandId)                          :1545
    _buildRef(strandId)                                 :1563
    _buildOverlayRef(strandId)                          :1582
    ...

  functions:
    compareStrings(a, b)                               :100
    normalizeCreateOptions(options)                     :245
    frontierToRecord(frontier)                          :310
    ...
```

**For Rust files:** show `struct`, `enum`, `trait`, `impl` blocks,
`fn`, `const`, `static`, `type` aliases, `mod` declarations.

**Key design choice:** private/internal symbols are included. The
agent needs to see the full shape to understand the code, not just
the public API.

### 3. `exports <file>`

Just the public surface — what this module exposes to importers.

```bash
code-nav exports src/domain/services/JoinReducer.js
```

```
named: createEmptyStateV5 (function)                   :42
named: reduceV5 (function)                             :142
named: applyFast (function)                            :301
default: JoinReducer (class)                           :450
```

For Rust: `pub` items at the module level.

### 4. `find <symbol>`

Where is this symbol **defined** across the codebase?

```bash
code-nav find reduceV5
```

```
src/domain/services/JoinReducer.js:142  export function reduceV5(...)
```

Unlike grep, this only returns **definitions**, not usage sites.
A function call, import, or type reference is not a hit.

### 5. `references <symbol>` (stretch)

Where is this symbol **used** across the codebase? This is the
inverse of `find` — import sites, call sites, type references.

Stretch goal because it requires cross-file resolution (following
imports). May be impractical without a full module resolver. Could
start with a simpler version: "files that import this symbol."

### 6. `deps <file>` (stretch)

What does this file import, and from where?

```bash
code-nav deps src/domain/services/StrandService.js
```

```
../errors/StrandError.js          StrandError
../utils/RefLayout.js             buildStrandRef, buildStrandBraidRef, ...
../utils/WriterId.js              generateWriterId
./PatchBuilderV2.js               PatchBuilderV2
./JoinReducer.js                  createEmptyStateV5, reduceV5
...
```

## Technology

### Parser: tree-sitter

tree-sitter is the right foundation:

- **Multi-language**: mature grammars for JavaScript, TypeScript,
  TSX, Rust — one parsing framework for all targets
- **Incremental**: re-parses only changed regions (future: watch
  mode)
- **Battle-tested**: powers GitHub code navigation, Neovim,
  Helix, Zed
- **Node.js bindings**: `tree-sitter` npm package + per-language
  grammar packages
- **Fast**: parses 2000-line files in single-digit milliseconds

oxc was considered but is JS/TS only. We need Rust coverage.

ast-grep was considered and may be useful for the `find` operation
(it already does structural pattern matching). But ast-grep is a
search tool, not an extraction tool. We need to extract complete
syntactic extents, not match patterns.

### Runtime: Node.js

- tree-sitter has first-class Node.js bindings via native addon
- MCP SDK (`@modelcontextprotocol/sdk`) is TypeScript/Node
- James's primary dev environment is Node
- CLI framework: minimal — `node:util.parseArgs` + direct output
- No build step needed for pure JS + native addons

### MCP server

Expose each operation as an MCP tool:

```json
{
  "tools": [
    { "name": "code_show", "description": "Extract a named symbol's source code" },
    { "name": "code_outline", "description": "Structural skeleton of a file" },
    { "name": "code_exports", "description": "Public exports of a module" },
    { "name": "code_find", "description": "Find where a symbol is defined" }
  ]
}
```

Transport: stdio (standard for Claude Code MCP servers).

### Project structure

```
@git-stunts/code-nav/
  bin/
    code-nav.js               CLI entry point
  src/
    parser/
      index.js                tree-sitter init + grammar loading
      javascript.js           JS/TS/TSX extraction queries
      rust.js                 Rust extraction queries
    operations/
      show.js                 Symbol extraction
      outline.js              File skeleton
      exports.js              Public surface
      find.js                 Definition search
    mcp/
      server.js               MCP server (stdio transport)
      tools.js                Tool definitions + handlers
    output/
      formatter.js            CLI output formatting
  test/
    fixtures/                 Sample JS/TS/Rust files
    unit/                     Operation tests
  package.json
  LICENSE                     Apache 2.0
```

## Open questions

1. **Scope resolution for `show`** — when you say `show foo`, should
   it search the whole project or require a file hint? Searching the
   whole project is more convenient but slower on large codebases.
   Could default to project-wide with a `--file` flag for precision.

2. **How deep does `outline` go?** — should it show nested functions
   inside methods? Probably not by default — just the top-level
   declarations and class/impl members. A `--depth` flag for deeper.

3. **JSDoc attachment** — tree-sitter's JS grammar treats comments
   as standalone nodes, not attached to declarations. Need a
   heuristic: "comment immediately preceding a declaration with no
   blank line gap belongs to that declaration." This is standard but
   requires custom logic.

4. **Rust impl block grouping** — `show VersionVector` should return
   the struct AND all impl blocks. But what about trait impls
   (`impl Display for VersionVector`)? Probably yes — include all
   impl blocks for the type.

5. **Performance on large monorepos** — `find` across a full project
   means parsing every file. Could be slow on 1000+ file repos.
   Mitigation: respect `.gitignore`, skip `node_modules`, and
   consider a lightweight file-level symbol index cache.

## Phasing

### Phase 1 — Core (MVP)

- `outline` for JS/TS files
- `show` for JS/TS files (top-level functions + class methods)
- CLI only, no MCP yet
- Tests against git-warp as the fixture codebase

### Phase 2 — Full JS/TS + MCP

- `exports` for JS/TS
- `find` across a project directory
- MCP server (stdio transport)
- Register in Claude Code config

### Phase 3 — Rust

- `outline` for Rust files
- `show` for Rust (functions, struct + impls, enum + impls, traits)
- `exports` for Rust (`pub` items)
- `find` for Rust

### Phase 4 — Polish

- `references` (stretch)
- `deps` (stretch)
- Performance: `.gitignore` awareness, symbol index cache
- `--json` output for all operations
