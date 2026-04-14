# Advanced multi-writer workflow documentation

**Audit ref:** CQ01-2.1

No documentation exists for advanced multi-writer workflows: conflict
analysis, strand-based speculative execution, braid composition, and
observer-relative queries are powerful features with zero user-facing
docs outside the type signatures.

These are the features that differentiate git-warp from simpler graph
stores. Power users who need them have to read source code.

## Proposal

Create `docs/ADVANCED.md` covering:
- Strands and speculative execution
- Braid composition and collapse
- Conflict analysis and resolution strategies
- Observer-relative queries
- Multi-writer coordination patterns

Include worked examples with real code.
