# Systems-Style Scorecard as pre-commit hook

**Effort:** M

## Idea

The Systems-Style JavaScript manifesto scorecard is currently a manual
process (AI evaluates touched files at the end of each turn). This could
be automated as a pre-commit hook that checks:

1. One-type-per-file: new class exports don't share a file with other classes
2. No `@typedef` for domain concepts (grep for typedef + domain path)
3. No `instanceof Map` where VersionVector is expected
4. No raw `2`/`3`/`4` checkpoint schema literals
5. No `err.message.includes(` (raccoon detector)
6. No `serialize()`/`toJSON()` on domain classes (P5)

Could use a simple AST-free grep approach (like the existing IRONCLAD
policy checker) or tree-sitter for structural checks.

## Why cool

Catches regressions at commit time. No AI needed. The manifesto becomes
a machine-enforced standard, not just documentation.
