---
id: "#811"
issue: "#811"
slug: "811-canonical-migration-guidance-contract"
title: "Generate migration CLI help and documentation from one canonical contract"
type: "Feature"
wave: 0
workstream: "W3"
status: "open-frontier"
prerequisites: []
unlocks: ["#822"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #811 (#811: Generate migration CLI help and documentation from one canonical contract) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (none) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (Migration CLI contract definition, --help formatter, docs/migrations/ verification test.) and exclude out-of-scope work (Indexed-root substrate migration implementation (#822).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #811 establishes a single source of truth for migration CLI flags, defaults, confirmation semantics, and documentation examples so README, migration guides, and --help cannot drift.

## 2. Problem Description

Migration command flags and examples are hand-maintained across README.md, docs/migrations/, and CLI --help output.

## 2b. Proposed Solution

Define one canonical migration CLI contract object/module and mechanically verify or generate --help and documentation examples from it.

## 2c. Alternatives considered and rejected

- Defer docs verification until after #822 finishes: rejected in #811 domain review because canonical help/docs can land now and #822 extends the contract.

## 2d. Acceptance Criteria

- [ ] One canonical contract module owns flag names, defaults, confirmation rules, and example placeholders.
- [ ] Automated tests execute or snapshot the canonical examples against the real CLI.
- [ ] Error examples cover repository-not-found, graph-not-found, empty repository, and upgrade-not-needed states.

## 2e. Test Plan

Golden: Run the migration CLI --help and documentation verification gate in Docker and confirm zero drift against docs/migrations/.

Edges: Missing repository path, unknown flag rejection, and dry-run vs. promote flags.

Known failure modes: Any divergence between docs/migrations/ examples and the canonical contract fails lint/test gates.

Fuzz and stress: CLI argument parser fuzzing over invalid flag combinations.

## 3. Prerequisites

- [x] None (root contract front)

## 4. Scope

In: Migration CLI contract definition, --help formatter, docs/migrations/ verification test.

Out: Indexed-root substrate migration implementation (#822).

## 5. Why now

Wave 0 root card with zero open prerequisites; unblocks #822.

## 6. Risks

Must not reintroduce retired docs paths forbidden by scripts/check-docs-topology.sh.

## 7. Definition of Done

Documentation and CLI --help tests pass in Docker and #811 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#811](https://github.com/git-stunts/git-warp/issues/811)
- Directly unlocks: `#822`
