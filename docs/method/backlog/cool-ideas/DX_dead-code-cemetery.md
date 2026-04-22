---
id: DX_dead-code-cemetery
blocked_by: []
blocks: []
---

# Dead code cemetery — automated detection

**Effort:** M

## Idea

This session found `strandPublicShape.js` (an identity transform that
does nothing), `browser/index.js` (a placeholder with no consumers),
the dead `classifyPath` function, and the unused `stubCapabilities`
export. Four corpses in one session, all hiding in plain sight. How
many more are there?

What if CI ran a dead-code detector? Not just unused exports — tools
like `ts-prune` handle those — but semantically dead code:

- **Identity transforms**: functions where every code path returns its
  input unchanged. `function transform(x) { return x; }` is a no-op
  wearing a trench coat.
- **Always-true conditionals**: `if (true)`, `if (x || !x)`, feature
  flags that were never flipped off.
- **Unreachable branches**: `switch` cases that can't match, `catch`
  blocks after calls that can't throw.
- **Orphaned exports**: `export function foo()` where no file in the
  repo imports `foo`.
- **Placeholder files**: modules that export only empty objects or
  no-op functions.

A simple first pass doesn't need an AST. Grep for `return x` where `x`
is the sole parameter name. Grep for exports that don't appear as
imports anywhere. Grep for files under 10 lines that export only `{}`.
Flag everything for human review — don't auto-delete, just surface.

The output could be a `dead-code-report.json` artifact in CI, rendered
as a GitHub Actions summary. Each entry: file path, line number,
detection reason, confidence level. Developers review at their leisure.
The cemetery grows until someone does a cleanup pass.

## Why cool

Dead code is invisible weight. It's imported, read, maintained,
refactored — all for nothing. An automated detector turns "I wonder
if this is still used" into "CI says nobody calls this." The cemetery
is a gift to your future self: a curated list of things you can safely
delete, with evidence.
