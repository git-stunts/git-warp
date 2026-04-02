# Safe Context: Replay-Safe Structural Reads for Coding Agents

**Cycle:** 0002-code-nav-tool
**Type:** Feature (new repo)

## Sponsor human

James — maintains large JS/TS and Rust codebases and wants coding
agents that can work precisely in large files without inflating
session cost. Has empirical data (Blacklight, 1,091 sessions,
291K messages) proving that context compounding from oversized reads
is the dominant cost driver in agentic coding.

## Sponsor agent

Claude — wastes context on full-file reads, oversized shell output,
and repeated exploration in long sessions. Read tool alone accounts
for 96.2 GB of context burden — 6.6x all other tools combined. 58%
of reads are full-file (no offset/limit). 64.5% of reads don't lead
to an edit of that file — they're exploration cost that could be
replaced by structural representations. Needs a policy-enforcing
access layer that returns the smallest correct representation needed
for the task.

## Hill

An agent working in a JS/TS or Rust codebase can obtain the minimum
structurally correct context required to act — file shape, export
surface, exact symbol body, or bounded source range — without
injecting large raw artifacts into long-lived conversation state.
The tool runs as an MCP server and CLI and enforces replay-safe
behavior by default.

## Playback questions

### Agent

1. When I request a 2000-line file, do I get an outline instead of
   the raw content? **YES/NO**
2. Can I extract just `StrandService.tick()` without reading
   StrandService.js? **YES/NO**
3. Am I blocked from reading binary files, build output, and
   generated artifacts? **YES/NO**
4. Does shell output get tailed instead of dumped in full?
   **YES/NO**
5. Can I save/load session state across `/clear` boundaries?
   **YES/NO**
6. Does it work on `.js`, `.ts`, `.tsx`, `.rs` files? **YES/NO**
7. Can I call every operation as an MCP tool? **YES/NO**

### Human

1. Does the tool install with one command and work without
   configuration? **YES/NO**
2. Can I see measurable reduction in context burden in Blacklight
   data after deploying it? **YES/NO**
3. Does it work across Claude Code, Gemini CLI, and Codex CLI?
   **YES/NO**
4. Can I use it from the terminal as a standalone CLI? **YES/NO**

## Non-goals

- Full semantic code intelligence (LSP replacement)
- Cross-file reference resolution in v1
- Persistent whole-repo index in v1
- Code modification (this is read-only)
- Arbitrary raw artifact passthrough
- Convenience wrapper around `cat`
- General-purpose memory system
- "Whatever the agent asked for, but prettier" — this tool is
  opinionated about what it returns

## The thesis

The biggest cost in agentic coding is not code generation. It is
replayed context. Safe-context replaces oversized raw reads with
bounded structural representations, so agents stay precise without
poisoning their own session state.

### Evidence (from Blacklight, 1,091 sessions)

| Finding | Number |
|---|---|
| Read context burden | 96.2 GB (6.6x all other tools) |
| Full-file reads (no offset/limit) | 58% of all reads |
| Reads that don't lead to editing that file | 64.5% |
| Dynamic read cap alone | 54.5% burden reduction |
| Session length cap alone | 58.9% burden reduction |
| Both combined | 75.1% burden reduction |
| Top 3 sessions (of 715) | 23% of all lifetime burden |
| WarpGraph.js | 1,053 reads, 85 sessions, 1.74 GB burden |
| Worst single session | 12.7 GB burden, 5,900 messages |

The data says:

1. Read is the monster.
2. Long sessions are money furnaces.
3. Shell output is material (especially Gemini).
4. Subagent dumps are context bombs.
5. Policy + session management handle 75% before any indexing.

## Before and after

Real scenarios. Token counts are raw output. Context burden =
tokens x messages remaining in session.

### Scenario 1: Understand a god object

**Before:** 7 Read calls across StrandService.js. ~4,700 tokens
raw, but at turn 5 of a 200-turn session that's
`4,700 x 195 = 916,500 tokens of context burden`.

**After:** `safe_read("StrandService.js")` → policy intercepts,
returns `file_outline`. ~175 tokens raw, same position =
`175 x 195 = 34,125 burden`. Then `code_show("StrandService.tick")`
for the one method needed. **96% raw reduction, 96% burden
reduction.**

### Scenario 2: Pre-refactor survey of 8 files

**Before:** ~24 Read calls, ~9,400 tokens raw. At turn 3 of a
150-turn session: `9,400 x 147 = 1,381,800 burden`.

**After:** 8 `file_outline` calls. ~1,400 tokens raw.
`1,400 x 147 = 205,800 burden`. **85% raw, 85% burden.** And the
context window stays clean for actual work — reasoning, test output,
edits.

### Scenario 3: The compounding catastrophe

**Before:** WarpGraph.js (800 LOC) read 12 times in a 400-message
session. Each read ~2,800 tokens. Total raw: 33,600. But
compounded across messages remaining at each read point: estimated
**5-8 million tokens of burden** from one file in one session.

**After:** First access returns `file_outline` (~280 tokens). Agent
requests specific symbols as needed via `code_show`. Even 10
targeted extractions total ~2,000 tokens raw. Burden drops by
**~95%** because each payload is small and the outline is never
re-read (agent has the shape).

### Scenario 4: The GIF incident

**Before:** `seek-demo.gif` read 4 times. 1.3 MB of binary per
read. **395 MB of context burden** from 4 tool calls.

**After:** `safe_read("seek-demo.gif")` → policy refuses. Returns:
`Binary file (GIF, 1.3 MB). Use ls -lh for metadata.` Zero bytes
of context burden. **100% reduction.**

### Scenario 5: The test loop

**Before:** `npm test` run 30 times in an edit-test loop. Each run
outputs ~8 KB. Late in session with 200 messages remaining:
`8,000 x 30 x 100 (avg remaining) = 24,000,000 burden`.

**After:** `run_capture("npm test", 60)` tees full output to
`/tmp/test.log`, returns only last 60 lines (~2 KB). If more needed,
`read_range("/tmp/test.log", 1, 50)`. Burden drops by **~75%**, and
the full output is still on disk if needed.

## Architecture

### Layer 1: Policy (the king)

Decides what kind of answer is allowed.

- No binary/media reads (`.gif`, `.png`, `.jpg`, `.pdf`, `.zip`,
  `.wasm`, `.bin`, `.sqlite`)
- No build/generated reads (`dist/`, `build/`, `target/`, `.next/`,
  `node_modules/`)
- Dynamic size cap based on session depth:

  | Session stage | Messages elapsed | Max raw output |
  |---|---|---|
  | Early | < 50 | 20 KB |
  | Mid | 50-200 | 10 KB |
  | Late | > 200 | 4 KB |

- Over-cap reads are downgraded to `file_outline` + jump table
- Optional re-read warning ("you already read this file 3 turns
  ago")

Policy is the product. Everything else enables it.

### Layer 2: Structural extraction (the enabler)

Tree-sitter-backed extraction for JS/TS/Rust:

- **File outline** — exports, declarations, class/impl members,
  line ranges
- **Symbol body** — complete syntactic extent of a named
  declaration, with doc comments
- **Export surface** — what this module exposes to importers
- **Definition finding** — where a symbol is defined (not used)

Tree-sitter is the right foundation:
- Multi-language (JS, TS, TSX, Rust in one framework)
- Fast (single-digit ms per file parse)
- Battle-tested (GitHub, Neovim, Zed, Helix)
- Node.js bindings via native addon

### Layer 3: Transport (necessary, not interesting)

- **MCP server** (stdio) — primary delivery. Works with Claude Code,
  Gemini CLI, Codex CLI
- **CLI** — for human use and testing

### Layer 4: Session hygiene (the other big lever)

- `state_save()` / `state_load()` — write/read
  `WORKING_STATE.md` for cross-clear continuity
- Tripwires (phase 3):
  - `messages > 500`
  - `edit_bash_transitions > 30`
  - `tool_calls_since_last_user_message > 80`
  - Any single output > 20 KB after 300 messages

## Command surface

### 1. `safe_read(path, intent?)`

Primary entry point. The main product.

Returns one of:
- **Exact file content** when safely under the cap
- **Structural outline** when too large
- **"Pick a symbol/range" guidance** when exploration is needed
- **Refusal** for binary/build/generated garbage

The `intent` parameter is optional. If provided ("I need to
understand the class shape" vs "I need to edit line 45"), the policy
can make smarter decisions.

### 2. `file_outline(path, opts?)`

Structural skeleton. Exports, top-level declarations, class/impl
members, line ranges. No bodies.

Cheap, structural, high-signal. This is what replaces 64.5% of
exploration reads.

### 3. `code_show(target, opts?)`

Precise extraction. The scalpel.

- `StrandService.tick` — a class method
- `src/foo.rs#VersionVector.merge` — file-qualified Rust method
- `reduceV5` — top-level function (project-wide search if ambiguous)

Returns the complete syntactic extent: body, JSDoc/doc comments,
decorators/attributes. Nothing else.

### 4. `code_find(symbol, opts?)`

Definitions only. Not grep. Not references. Not "anything containing
this string."

Returns file path + line number for every definition of the symbol
across the project.

### 5. `read_range(path, start, end)`

For when you know where you're going. Bounded, no policy
interception (the caller already has a precise target).

### 6. `run_capture(cmd, tail?)`

Runs a shell command. Tees full output to a log file. Returns only
the last N lines (default 60). Full output available on disk via
`read_range` if needed.

Because the data shows shell output is material, and for Gemini it
was the #1 burden source.

### 7. `state_save(content)` / `state_load()`

Thin wrapper over `WORKING_STATE.md`. Saves/loads structured session
state for cross-clear continuity.

Because the data is screaming that runaway sessions are the other
half of the disaster.

## Open questions

1. **Session depth tracking** — How does the MCP server know how
   deep the session is? MCP tools don't receive conversation
   metadata. Options: (a) the agent tells it via a parameter,
   (b) the server counts its own tool calls as a proxy,
   (c) a hook injects session depth.

2. **Re-read detection** — Tracking "you already read this" requires
   the server to maintain per-session state. Feasible since the
   server lives for the session duration, but needs a simple
   in-memory cache.

3. **JSDoc attachment** — tree-sitter treats comments as standalone
   nodes. Need a heuristic: "comment immediately preceding a
   declaration with no blank line gap belongs to it."

4. **Rust impl grouping** — `code_show VersionVector` should return
   struct + all impl blocks, including trait impls. Requires walking
   the full file AST, not just pattern matching.

5. **Project root detection** — For `code_find` (project-wide
   search), how to determine the project root? Options:
   `.git` presence, `package.json`, `Cargo.toml`, or explicit
   config.

6. **Cross-LLM MCP compatibility** — Claude Code, Gemini CLI, and
   Codex CLI all support MCP but with slightly different
   configuration. Need to verify stdio transport works identically
   across all three.

## Phasing

### Phase 1 — The Governor

Ship: `safe_read`, `file_outline`, `read_range`, `run_capture`,
`state_save`/`state_load`. JS/TS only. MCP + CLI.

**Goal:** change behavior immediately. This phase alone should
deliver the 54.5% read burden reduction that the dynamic cap
promises, plus shell output containment.

### Phase 2 — Precision tools

Add: `code_show`, `code_find`, `exports`. Rust support for all
structural operations.

**Goal:** make safe reads frictionless. When the governor
downgrades a read to an outline, the agent can immediately request
the exact symbol it needs.

### Phase 3 — Session intelligence

Add: tripwires, re-read warnings, session-depth-aware enforcement,
automatic `WORKING_STATE.md` nudges.

**Goal:** stop runaway sessions before they become archaeological
sites.

### Phase 4 — Optional sophistication

Maybe: lightweight symbol cache, import/deps views,
references-lite, symbol-aware revision diffs.

Not before the first three phases prove themselves.

## Project structure

```text
@git-stunts/safe-context/
  bin/
    safe-context.js            CLI entry point
  src/
    policy/
      rules.js                 Ban lists, size caps, dynamic thresholds
      gate.js                  Decision engine (pass/outline/refuse)
    parser/
      index.js                 Tree-sitter init + grammar loading
      javascript.js            JS/TS/TSX extraction queries
      rust.js                  Rust extraction queries
    operations/
      safe-read.js             Policy-enforced read
      outline.js               File skeleton
      show.js                  Symbol extraction
      find.js                  Definition search
      range.js                 Bounded reads
      capture.js               Shell output tailing
      state.js                 Session state save/load
    mcp/
      server.js                MCP server (stdio transport)
      tools.js                 Tool definitions + handlers
    output/
      formatter.js             CLI output formatting
  test/
    fixtures/                  Sample JS/TS/Rust files
    unit/                      Operation tests
    policy/                    Policy decision tests
  package.json
  LICENSE                      Apache 2.0
```

## Success criteria

- Large exploratory reads are replaced by outlines and targeted
  reads
- Binary/build/generated reads are blocked or redirected
- Long-session compounding is reduced through policy and state
  resets
- Agents can operate effectively in 2K+ LOC files without reading
  the whole file
- Measurable reduction in context burden visible in Blacklight data
  after deployment
