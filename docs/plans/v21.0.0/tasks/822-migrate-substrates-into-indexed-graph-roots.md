---
id: "#822"
issue: "#822"
slug: "822-migrate-substrates-into-indexed-graph-roots"
title: "Migrate retained substrates directly into indexed graph roots with verified promotion"
type: "Feature"
wave: 3
workstream: "W3"
status: "blocked"
prerequisites: ["#811", "#817", "#818 (merged)", "#819", "#820", "#821"]
unlocks: ["#814", "#823"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Feature

```text
Execute task #822 (#822: Migrate retained substrates directly into indexed graph roots with verified promotion) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#811, #817, #818 (merged), #819, #820, #821) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (scripts/v20-to-v21/ migrator, scratch verifier, CAS promoter, and docs/migrations/v21/README.md.) and exclude out-of-scope work (Deleting legacy full-state decoders from production runtime (#814 isolates legacy decoding in migration scripts only).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

Issue #822 is a required v21.0.0 card owning bounded v20-to-v21 repository migration into indexed retained roots and cone/custody structures.

## 2. Problem Description

Migrating large v19/v20 repositories must not hit the 5 MiB full-state CBOR ceiling or mutate source refs before scratch verification succeeds.

## 2b. Proposed Solution

Extend the v20-to-v21 migrator (using #811's canonical CLI contract) to build #815/#817 indexed roots and #819-#821 recursive references in a scratch workspace, verify neighborhood and recursive reads, and promote via atomic compare-and-swap.

## 2c. Alternatives considered and rejected

- Promote refs before verifying readable indexed roots: rejected by the v21.0.0 exit invariant ('Source refs remain authoritative until migration verification and compare-and-swap promotion succeed').

## 2d. Acceptance Criteria

- [ ] Source refs remain untouched until scratch verification and compare-and-swap promotion succeed.
- [ ] Interrupted or refused migrations preserve complete recovery and resume idempotently.
- [ ] Attachment streams (#818) and recursive graph references (#819-#821) are verified without eager collection.

## 2e. Test Plan

Golden: Migrate a multi-writer v20 repository containing attachments, strands, and child graph references to v21, verify semantics in scratch, promote, and read via Optic.

Edges: Concurrent v20 writer advancing a ref during migration (CAS refusal), interrupted promotion resume, and already-migrated repository.

Known failure modes: Verification mismatch or CAS conflict aborts promotion, leaves source refs authoritative, and reports a typed diagnostic.

Fuzz and stress: Fault-injected migrations across deep/wide repositories under a fixed Docker heap ceiling.

## 3. Prerequisites

- [ ] `#811`
- [ ] `#817`
- [x] `#818 (merged)`
- [ ] `#819`
- [ ] `#820`
- [ ] `#821`

## 4. Scope

In: scripts/v20-to-v21/ migrator, scratch verifier, CAS promoter, and docs/migrations/v21/README.md.

Out: Deleting legacy full-state decoders from production runtime (#814 isolates legacy decoding in migration scripts only).

## 5. Why now

Wave 3 convergence point for #811, #817, and #819-#821 before #814 and #823.

## 6. Risks

Legacy full-state decoding if needed for old checkpoints must stay strictly isolated inside migration scripts.

## 7. Definition of Done

100% coverage on touched migration modules and #822 closes.

## 8. Stakeholders

James Ross (maintainer and acceptance owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#822](https://github.com/git-stunts/git-warp/issues/822)
- Directly unlocks: `#814`, `#823`
