---
report_id: "AUD-2026-05-04-DQ01"
title: "Documentation Quality Audit: git-warp v17 Release Branch"
status: "Final"
audit:
  date_started: 2026-05-04
  date_completed: 2026-05-04
  type: "Full"
  scope: "README.md, docs/, .github/, public API examples"
  compliance_frameworks: ["Project METHOD", "Release Hygiene", "Markdown Lint", "Docs Code-Sample Lint"]
target:
  repository: "github.com/git-stunts/git-warp"
  branch: "release/v17.0.0"
  commit_hash: "2209d3a5"
  language_stack: ["Markdown", "TypeScript examples", "Node.js package docs"]
  environment: "Pre-Release Local"
methodology:
  automated_tools: ["markdownlint", "Markdown code-sample linter", "ripgrep", "TypeScript Compiler"]
  manual_review_hours: 3
  false_positive_rate: "Low"
summary:
  total_findings: 7
  severity_count:
    critical: 1
    high: 4
    medium: 2
    low: 0
  remediation_status: "Pending"
related_reports:
  previous_audit: "AUD-2026-04-14-DQ01"
  tracking_ticket: "docs/method/backlog/bad-code"
---

# Documentation Quality Audit

## Evidence Checked

This audit reviewed the root README, user-facing guides, API reference,
architecture docs, standard repository docs, and docs lint status.

Automated status before this report was written:

| Command | Result | Notes |
|---------|--------|-------|
| `npm run lint:md` | PASS | Markdown formatting passed. |
| `npm run lint:md:code` | PASS | Existing Markdown code samples passed the repo linter. |
| `npm run typecheck:consumer` | FAIL | Public consumer type expectations still mention removed materialization APIs. |
| `npm run test:local` | FAIL | Several failures are stale materialization/test-contract failures. |

## 1. Accuracy and Effectiveness Assessment

### 1.1. Core Mismatch

The single most critical mismatch is the materialization frontdoor.
`README.md:37-38` tells users:

```typescript
await graph.materialize.materialize({});
```

That is inaccurate for the current `WarpGraph` interface. The public
surface in `src/domain/WarpGraph.ts:93-113` has no `materialize`
capability. The README also lists `materialize` under the Folding
capability at `README.md:62-67`, while the code now exposes
`folding.checkpoint` and flat `checkpoint`, not a public materialize
capability.

This is the most severe docs issue because it breaks the first-run
path and reinforces the old mental model that v17 is supposed to
delete.

### 1.2. Audience and Goal Alignment

The primary audience is package consumers building multi-writer,
causal graph workflows, with a secondary audience of contributors and
release maintainers.

The docs partially answer the top questions:

| Audience Question | Current State | Assessment |
|-------------------|---------------|------------|
| How do I open a graph, write, and read? | README and Getting Started show opening/writing, but read snippets still use materialization. | Not accurate enough. |
| What are the v17 public nouns and blessed read paths? | README names worldlines/observers, but guides still mix `WarpApp`, `WarpCore`, materialize, query, and worldline terms. | Confusing. |
| How do I contribute, report security issues, and run release gates? | `.github/CONTRIBUTING.md`, `.github/SECURITY.md`, and `.github/CODE_OF_CONDUCT.md` exist, but root-level discoverability is missing. | Present but hidden. |

### 1.3. Time-to-Value Barrier

The biggest TTV bottleneck is not setup mechanics; it is contradictory
read guidance. A new developer can install, import `openWarpGraph`,
and construct a Git adapter, but the first documented read goes
through an API that is absent from the public type. This forces the
developer into source spelunking before they can complete the first
write/read loop.

Secondary TTV friction:

- `docs/ADVANCED_GUIDE.md:13-23` says the public roots are `WarpApp`
  and `WarpCore`, while README and current API reference prefer
  `openWarpGraph()`.
- `docs/API_REFERENCE.md:802-803` still uses
  `graphA.materialize.materialize({})`.
- Error guidance in source still points to `materialize()`, so runtime
  failures would send users back to stale docs.

## 2. Required Updates and Completeness Check

### 2.1. README.md Priority Fixes

Top three README fixes:

- Replace the Quick start read path at `README.md:37-41` with a
  materialization-free worldline/optic/reading example that matches the
  current public type.
- Rewrite the admission architecture table at `README.md:62-67` so
  Folding lists `checkpoint` only, and Revelation clearly owns `query`,
  `subscriptions`, and `provenance`.
- Add visible links to contribution and security docs. Root files
  `CONTRIBUTING.md`, `SECURITY.md`, and `CODE_OF_CONDUCT.md` are
  absent; `.github/` versions exist but are not surfaced from the
  README.

### 2.2. Missing Standard Documentation

The repo has standard docs under `.github/`, but lacks root-level
discoverability:

- Missing root `CONTRIBUTING.md` or README link to
  `.github/CONTRIBUTING.md`.
- Missing root `SECURITY.md` or README link to
  `.github/SECURITY.md`.
- Missing root `CODE_OF_CONDUCT.md` or README link to
  `.github/CODE_OF_CONDUCT.md`.

For a published package, root-level discoverability matters because
many registries, code hosts, and human readers expect those files or
links at the top of the repository.

### 2.3. Supplementary Documentation

The complex area most in need of dedicated documentation is v17
Readings and Optics over causal worldlines. The design corpus contains
planning notes, but the public docs do not yet provide a stable
developer guide that answers:

- How do I read the current admitted worldline?
- How do I read a pinned coordinate?
- How do observers/apertures relate to query results?
- How do checkpoint-backed readings avoid whole-graph materialization?
- Which replay/materialization functions remain internal or tooling-only?

This should become `docs/READINGS_AND_OPTICS.md` and be linked from
README, Getting Started, Guide, API Reference, and Architecture.

## 3. Final Action Plan

### 3.1. Recommendation Type

**A. Recommend incremental updates to the existing README and
documentation.**

A complete rewrite is not necessary. The docs have good structure and
several valuable signposts. The problem is targeted but severe: the
read/materialization contract needs an immediate v17 correction, and
standard contributor/security docs need root-level discovery.

### 3.2. Deliverable

Apply focused documentation fixes in this order:

1. Correct README quick start and capability table.
2. Correct Getting Started read examples.
3. Add `docs/READINGS_AND_OPTICS.md`.
4. Update API Reference materialization-era snippets and error guidance.
5. Add root docs pointers or README links for contributing, security,
   and code of conduct.
6. Add docs-code regression coverage that blocks future public
   materialization examples.

### 3.3. Mitigation Prompt

```text
Perform an incremental v17 documentation repair. First add RED docs-code tests proving README.md, docs/GETTING_STARTED.md, docs/GUIDE.md, and docs/API_REFERENCE.md public snippets do not call `graph.materialize`, `graph.materialize.materialize`, or `_materializeGraph`. Green by replacing materialization-era snippets with v17 worldline/optic/reading examples that compile against `openWarpGraph()`. Create docs/READINGS_AND_OPTICS.md covering live worldline reads, pinned coordinate reads, observer/aperture reads, checkpoint-backed readings, provenance readings, and substrate/tooling-only replay. Update README's capability table so Folding lists checkpoint rather than materialize. Add root-level discoverability for `.github/CONTRIBUTING.md`, `.github/SECURITY.md`, and `.github/CODE_OF_CONDUCT.md`, either as short pointer files or explicit README links. Finish with `npm run lint:md`, `npm run lint:md:code`, `npm run typecheck:consumer`, and the relevant docs-code tests passing.
```
