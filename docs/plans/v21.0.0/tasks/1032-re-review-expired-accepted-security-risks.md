---
id: "#1032"
issue: "#1032"
slug: "1032-re-review-expired-accepted-security-risks"
title: "Re-review the four expired accepted security risks in .github/SECURITY.md"
type: "Decision"
wave: 0
workstream: "W5"
status: "open-frontier"
prerequisites: ["#892 (merged)"]
unlocks: ["#823"]
ste100_edition: "ASD-STE100 Issue 9 (unverified draft)"
---

# Decision

```text
Execute task #1032 (#1032: Re-review the four expired accepted security risks in .github/SECURITY.md) in repository ~/git/git-warp.
1. Read this task plan, AGENTS.md, docs/ANTI_SLUDGE_POLICY.md, and docs/SYSTEMS_STYLE_TYPESCRIPT.md.
2. Verify that all prerequisites (#892 (merged)) are merged on main.
3. Follow strict RED-to-GREEN TDD inside Docker (scripts/run-in-docker.sh) under git-locks coordination.
4. Implement only the in-scope changes (.github/SECURITY.md and security bitmap threat-model tests if expectations reference the table.) and exclude out-of-scope work (New sync encryption features (#488).).
5. Enforce 100% test coverage on touched files, max function complexity <= 5, zero anti-sludge violations, and green lint/typecheck gates.
6. Update ROADMAP.md checkboxes and the Open Frontier table when the PR merges.
```

## 1. Background Context

All four Accepted Risks in .github/SECURITY.md have been marked 'EXPIRED 2026-08-01 — pending re-review' since #892.

## 2. The choice

For each of the four risks (roaring-wasm bitmap faults, cbor-x untrusted sync payloads, nonce cache loss on restart, and sync endpoint rate limiting), do we re-accept with updated mitigations and expiry date, close as mitigated, or file a blocking remediation issue?

## 2b. Options and consequences

- Option A: Audit current v21 mitigations (Wasm bounds checks, CBOR size guards, sync auth), update .github/SECURITY.md with current evidence and a new review date, and file follow-up issues for any unmitigated gap.
- Option B: Block v21.0.0 until all four risks are eliminated in code.

## 2c. Rests on

Current mitigations in src/infrastructure/codecs/CborCodec.ts, roaring bitmap threat model tests, and HttpSyncServer.ts.

## 2d. Who decides, and by when

James Ross (maintainer), before v21.0.0 release preflight.

## 2e. What is blocked until then

v21.0.0 release gate (release-guard / security audit).

## 2f. Reversible

Yes, by subsequent .github/SECURITY.md amendment.

## 3. Prerequisites

- [x] `#892 (merged)`

## 4. Scope

In: .github/SECURITY.md and security bitmap threat-model tests if expectations reference the table.

Out: New sync encryption features (#488).

## 5. Why now

Priority ASAP release blocker with zero code dependencies.

## 6. Risks

Stale mitigation claims in .github/SECURITY.md that do not match current source files.

## 7. Definition of Done

- [ ] Zero rows in .github/SECURITY.md are marked expired, and every row cites exact current source files and mitigations.

## 8. Stakeholders

James Ross (maintainer and decision owner); `@git-stunts/git-warp` contributors and runtime consumers.

## 9. Related Issues

- Issue: [#1032](https://github.com/git-stunts/git-warp/issues/1032)
- Directly unlocks: `#823`
