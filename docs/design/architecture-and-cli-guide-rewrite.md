# Architecture And CLI Guide Rewrite

Backlog: `OG-012`
Status: DESIGN
Date: 2026-03-28

## Problem

The documentation corpus audit identified two remaining canonical docs that still drifted from the `v15` public surface:

- `ARCHITECTURE.md`
- `docs/CLI_GUIDE.md`

Both files were still teaching removed or stale ideas:

- `WarpGraph` as the public root
- `strand` as the product noun
- a flatter runtime story than the current `WarpApp` / `WarpCore` split
- outdated CLI examples and setup code

That made them release blockers even after the README, Guide, and Strand docs were updated.

## Sponsor perspectives

- sponsor human: a developer or operator trying to understand the current system without reading stale nouns
- sponsor agent: a coding agent inferring architecture and command usage from the docs corpus
- sponsor maintainer: a release owner trying to decide whether the docs set is coherent enough for `v15`

## Decisions

### 1. `ARCHITECTURE.md` should be a system map, not a front-door tutorial

The architecture doc should explain:

- the purpose of `WarpApp`
- the purpose of `WarpCore`
- the role of the internal `WarpRuntime` engine
- hexagonal layering
- the write, read, strand, and tooling paths

It should not act like first-use onboarding.

### 2. `docs/CLI_GUIDE.md` should be a current command workflow guide

The CLI guide should teach:

- how to install and invoke the CLI
- how to seed a sample graph using `WarpApp`
- how to use the main command families
- how to think about the CLI as operational and inspection surface

It should not rely on removed public nouns or outdated command naming.

### 3. The docs index should stop treating these files as unresolved blockers once reconciled

Once both files are rewritten against the current public surface, `docs/README.md` should present them as normal current docs rather than flagged blockers.

### 4. Doc drift should be locked down with executable policy

Add focused script tests that verify:

- `ARCHITECTURE.md` teaches the current public/core split
- `docs/CLI_GUIDE.md` uses the current nouns and command families
- the docs index links the architecture doc and no longer flags these files as unresolved blockers

## Exit criteria

This slice is complete when:

1. `ARCHITECTURE.md` teaches `WarpApp`, `WarpCore`, `Worldline`, `Lens`, `Observer`, and `Strand`
2. `docs/CLI_GUIDE.md` uses current API/setup examples and current command families
3. the docs index reflects those reconciled docs as part of the live corpus
4. focused doc-shape tests pass
5. the slice closes with a design alignment audit
