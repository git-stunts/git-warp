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

## Core operations

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
