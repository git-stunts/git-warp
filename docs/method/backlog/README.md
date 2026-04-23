# backlog

This README is the canonical dependency map for the repo-visible
backlog.

Parallel agent staffing lives in [WORKLOADS.md](WORKLOADS.md).

It exists because the METHOD MCP surface is currently inconsistent on
this repo: `method_doctor` recognizes the workspace and returns
diagnostics, while `method_status` and
`method_backlog_dependencies` reject the same path as "not a METHOD
workspace." Until that drift is fixed, repo-truth parsing of
`docs/method/backlog/**/*.md` is the authoritative planning surface.

## Snapshot

Current repo truth for live backlog notes, excluding backlog meta docs
such as `README.md`, `SCORECARD.md`, and `WORKLOADS.md`:

| Metric | Count |
|--------|------:|
| Live backlog items | 390 |
| Root backlog items | 31 |
| `asap/` | 0 |
| `bad-code/` | 143 |
| `cool-ideas/` | 94 |
| `inbox/` | 5 |
| `up-next/` | 35 |
| `v17.0.0/` | 58 |
| `v18.0.0/` | 8 |
| `v19.0.0/` | 11 |
| `v20.0.0/` | 2 |
| `v21.0.0/` | 4 |
| Items with YAML frontmatter | 390 |
| Items without YAML frontmatter | 0 |
| Items with explicit `id` | 390 |
| Items declaring dependency fields | 390 |
| Items with explicit `feature` | 385 |
| Distinct explicit feature values | 12 |
| `bad-code/` items with explicit `release_home` | 143 |
| Items with non-empty explicit dependency edges | 72 |

## Dependency Law

Every live note now declares:

- `id`
- `blocked_by`
- `blocks`

That makes the graph repo-inspectable without special-casing lanes that
still lack frontmatter.

Every live note outside `inbox/` now also declares:

- `feature`

That field names the subsystem home of the task. It does not replace
release-lane sequencing; it clarifies it.

`bad-code/` notes also declare:

- `release_home`

That field answers which release is expected to absorb, retire, or
otherwise burn down the debt note. The note stays in `bad-code/`; the
release home is a second planning axis, not a lane move.

Lane inheritance still matters, but in a narrower way:

- **Explicit graph edges** win when a note names real upstream or downstream
  work.
- **Lane inheritance** supplies the default sequencing when a note's
  dependency arrays are empty.

### Feature Tags

`feature` is for subsystem identity, not release planning.

- **Lane** answers: "When should this ship?"
- **Feature** answers: "What body of work does this belong to?"

The current cleanup pass stamps `feature:` onto:

- backlog root notes
- `bad-code/` notes
- `cool-ideas/` notes
- `up-next/` notes
- all numbered release-lane notes in `v17.0.0/`, `v18.0.0/`, and
  `v19.0.0/`
- selected numbered-lane trunk notes in later lanes where cross-feature
  seams are already real
- `inbox/` remains intentionally unscoped until triage or promotion

That gives the repo enough structure to build stronger internal chains
inside a feature before inventing broad cross-feature blockers.

### Feature-First Sequencing Rule

When a note has a `feature:` home:

1. Build the feature's internal spine first.
2. Prefer trunk-to-trunk dependencies over leaf-to-leaf chatter.
3. Add cross-feature edges only where one feature produces an artifact
   another feature cannot honestly proceed without.
4. Keep `blocked_by` / `blocks` as the source of truth. The feature graph
   is derived from task edges, not duplicated in separate metadata.

### Debt Release Homes

`bad-code/` stays a debt ledger, not a release lane.

- **Lane** still answers where the note lives.
- **Feature** answers which subsystem owns the smell.
- **Release home** answers which release is supposed to make the note
  disappear.

Use `release_home` to answer "what debt must this release actually
burn down?" without dumping debt notes wholesale into numbered release
lanes.

### Dependency Bands

| Band | Scope | Meaning | May Be Blocked By |
|------|-------|---------|-------------------|
| `B0` | `inbox/` | Raw capture. No commitment, no scheduling, no downstream guarantees. | Triage only. |
| `B1` | backlog root | Unlaned maintenance and reference work. Needs classification or direct pull before it should block committed work. | `B0` or direct human pull. |
| `B2` | `bad-code/` | Foundational debt and invariant repair. This lane can legitimately block release or execution work. | `B0`, `B1`, or lower-level debt in `B2`. |
| `B3` | `v17.0.0/` | Current committed release work. Explicit per-note edges win here. | `B2`, same-band work, or explicit edges. |
| `B4` | `v18.0.0/`, `up-next/` | Next-major substrate work plus unslotted near-term feature overflow after the active release. | `B2`, `B3`, or explicit same-band edges. |
| `B5` | `v19.0.0/` | Doctrine/runtime follow-through after the substrate cut. | `B2`, `B3`, `B4`, or explicit same-band edges. |
| `B6` | `v20.0.0/`, `v21.0.0/`, `cool-ideas/` | Far-horizon slice-first/runtime and distributed/plural follow-through plus speculative orbit. | Promotion into another lane or completion of lower numbered bands. |

### Lane Contracts

| Lane | Band | Contract |
|------|------|----------|
| `inbox/` | `B0` | Anything here is blocked on triage, not implementation. |
| backlog root | `B1` | These notes are real work, but still need lane assignment or an explicit pull decision. When `feature:` is present, treat that as the subsystem home while release-home remains undecided. |
| `bad-code/` | `B2` | Invariant debt can block `v17.0.0`, `v18.0.0`, and `up-next`. |
| `v17.0.0/` | `B3` | This is the active release graph for TypeScript migration and streaming ORSets. |
| `v18.0.0/` | `B4` | This is the next-major graph-substrate convergence lane. |
| `up-next/` | `B4` | Feature-overflow queue behind the active release and next-major substrate work unless explicitly promoted into a numbered lane. |
| `v19.0.0/` | `B5` | Doctrine, observer, and admission convergence after the substrate cut. |
| `v20.0.0/` | `B6` | Slice-first runtime realization after `v19.0.0/` hardens the noun and support law. |
| `v21.0.0/` | `B6` | Common-basis, braid, and fuller distributed observer geometry after `v20.0.0/`. |
| `cool-ideas/` | `B6` | Never blocks committed lanes until moved into a committed lane. |
| `asap/` | dormant | Presently unused. Do not treat it as a scheduling source while numbered release lanes are active. |

### Interpretation Rule

For any note whose `blocked_by` list is empty:

1. Inherit the dependency band of its lane.
2. Treat lower-numbered bands as eligible prerequisites.
3. Treat higher-numbered bands as downstream or non-blocking.
4. If a note is promoted into a new lane, it inherits the new lane's
   band immediately.

This gives every live note a dependency posture today while still
allowing note-local edges to override band inheritance when the text
justifies a stronger sequencing rule.

## Explicit Graph Already In Files

Current explicit-graph totals:

- `390` notes define an `id`
- `390` notes declare `blocks` and `blocked_by` fields
- `385` notes currently declare an explicit `feature`
- `143` `bad-code/` notes currently declare an explicit `release_home`
- `72` notes currently name at least one non-empty upstream or
  downstream edge

Most notes still rely on empty dependency arrays plus lane inheritance.
That is intentional: the cleanup pass made every note explicit, then
started feature-first spine wiring without inventing fake blockers where
the note text does not justify them.

## Lane Inventory And Inherited Dependencies

The sections below assign every live backlog note to a dependency band.
For notes without explicit edges, the lane contract is the dependency
map.

### `inbox/` — `B0` Intake

Dependency posture:

- blocked on triage only
- does not block committed work yet

Items:

- [DX_bearing-md.md](inbox/DX_bearing-md.md)
- [DX_method-cli-tooling.md](inbox/DX_method-cli-tooling.md)
- [DX_method-mcp-workspace-detection-drift.md](inbox/DX_method-mcp-workspace-detection-drift.md)
- [DX_method-v2-upgrade.md](inbox/DX_method-v2-upgrade.md)
- [DX_witness-directory-convention.md](inbox/DX_witness-directory-convention.md)

### backlog root — `B1` Unlaned Maintenance And Reference Work

Dependency posture:

- blocked on classification or direct pull
- should not block committed delivery lanes until promoted

Items:

- [DX_api-examples-review-checklist.md](DX_api-examples-review-checklist.md)
- [DX_archived-doc-status-guardrail.md](DX_archived-doc-status-guardrail.md)
- [DX_batch-review-fix-commits.md](DX_batch-review-fix-commits.md)
- [DX_browser-guide.md](DX_browser-guide.md)
- [DX_consumer-test-type-import-coverage.md](DX_consumer-test-type-import-coverage.md)
- [DX_contributor-review-hygiene-guide.md](DX_contributor-review-hygiene-guide.md)
- [DX_deno-smoke-test.md](DX_deno-smoke-test.md)
- [DX_docs-consistency-preflight.md](DX_docs-consistency-preflight.md)
- [DX_docs-version-sync-precommit.md](DX_docs-version-sync-precommit.md)
- [DX_jsr-publish-deno-panic.md](DX_jsr-publish-deno-panic.md)
- [DX_pr-ready-merge-cli.md](DX_pr-ready-merge-cli.md)
- [DX_public-api-catalog-playground.md](DX_public-api-catalog-playground.md)
- [DX_pure-typescript-example-app.md](DX_pure-typescript-example-app.md)
- [DX_readme-install-section.md](DX_readme-install-section.md)
- [DX_rfc-field-count-drift-detector.md](DX_rfc-field-count-drift-detector.md)
- [DX_security-sync-docs.md](DX_security-sync-docs.md)
- [DX_test-file-wildcard-ratchet.md](DX_test-file-wildcard-ratchet.md)
- [DX_typed-custom-zod-helper.md](DX_typed-custom-zod-helper.md)
- [DX_vitest-runtime-excludes.md](DX_vitest-runtime-excludes.md)
- [DX_warpgraph-constructor-lifecycle-docs.md](DX_warpgraph-constructor-lifecycle-docs.md)
- [DX_warpgraph-invisible-api-docs.md](DX_warpgraph-invisible-api-docs.md)
- [PERF_benchmark-budgets-ci-gate.md](PERF_benchmark-budgets-ci-gate.md)
- [PERF_out-of-core-materialization.md](PERF_out-of-core-materialization.md)
- [TRUST_keystore-prevalidated-cache.md](TRUST_keystore-prevalidated-cache.md)
- [TRUST_property-based-fuzz-test.md](TRUST_property-based-fuzz-test.md)
- [TRUST_record-round-trip-snapshot.md](TRUST_record-round-trip-snapshot.md)
- [TRUST_schema-discriminated-union.md](TRUST_schema-discriminated-union.md)
- [TRUST_unsigned-record-edge-cases.md](TRUST_unsigned-record-edge-cases.md)
- [VIZ_mermaid-diagram-content-checklist.md](VIZ_mermaid-diagram-content-checklist.md)
- [VIZ_mermaid-invisible-link-fragility.md](VIZ_mermaid-invisible-link-fragility.md)
- [VIZ_mermaid-rendering-smoke-test.md](VIZ_mermaid-rendering-smoke-test.md)

### `bad-code/` — `B2` Foundational Debt

Dependency posture:

- may legitimately block `v17.0.0/`, `v18.0.0/`, and `up-next/`
- should be treated as prerequisite work when a release note touches the
  same invariant

Canonical grouped inventory:

- [bad-code/README.md](bad-code/README.md)

Invariant counts:

| Legend | Count |
|--------|------:|
| `HEX` | 17 |
| `BND` | 7 |
| `MODEL` | 22 |
| `CAST` | 9 |
| `PORT` | 12 |
| `OWN` | 31 |
| `SUB` | 10 |
| `SPEC` | 31 |

### `v17.0.0/` — `B3` Active Release Graph

Dependency posture:

- explicit frontmatter edges override lane inheritance
- release notes may be blocked by `bad-code/` debt when they touch the
  same invariant or subsystem
- this lane is intentionally limited to TypeScript migration,
  streaming ORSets, and current-substrate modernization

Canonical lane readme:

- [v17.0.0/README.md](v17.0.0/README.md)
- Historical release ledger:
  [../../releases/v17.0.0/README.md](../../releases/v17.0.0/README.md)

Prefix counts:

| Prefix | Count |
|--------|------:|
| `API` | 4 |
| `CLI` | 2 |
| `CORE` | 1 |
| `CROSS` | 1 |
| `GOD` | 6 |
| `HYGIENE` | 2 |
| `INFRA` | 9 |
| `MCP` | 1 |
| `PERF` | 1 |
| `PROTO` | 8 |
| `SLUDGE` | 5 |
| `TRUST` | 1 |
| `TS` | 14 |

### `v18.0.0/` — `B4` Graph-Substrate Convergence

Dependency posture:

- downstream of `v17.0.0/`
- explicit frontmatter edges carry the actual substrate cut order
- this lane is the Echo-shaped graph-model cut, not full repo parity

Canonical lane readme:

- [v18.0.0/README.md](v18.0.0/README.md)

Prefix counts:

| Prefix | Count |
|--------|------:|
| `INFRA` | 1 |
| `PROTO` | 6 |
| `TRUST` | 1 |

### `v19.0.0/` — `B5` Doctrine And Runtime Convergence

Dependency posture:

- follows the substrate cut in `v18.0.0/`
- holds observer, admission, strand, and teaching-contract work that
  should not muddy the substrate migration

Canonical lane readme:

- [v19.0.0/README.md](v19.0.0/README.md)

Prefix counts:

| Prefix | Count |
|--------|------:|
| `API` | 1 |
| `HYGIENE` | 2 |
| `PROTO` | 8 |

### `v20.0.0/` — `B6` Slice-First Runtime Realization

Dependency posture:

- downstream of `v19.0.0/`
- use this lane only for notes that already name `v20` as their release home
- keep broader speculative work in `up-next/` or `cool-ideas/` until it stops
  hand-waving

Canonical lane readme:

- [v20.0.0/README.md](v20.0.0/README.md)

Prefix counts:

| Prefix | Count |
|--------|------:|
| `PROTO` | 2 |

### `v21.0.0/` — `B6` Distributed And Plural Runtime Follow-Through

Dependency posture:

- downstream of `v20.0.0/`
- holds notes that already name `v21` as their release home
- use explicit edges only when the notes themselves defend them

Canonical lane readme:

- [v21.0.0/README.md](v21.0.0/README.md)

Prefix counts:

| Prefix | Count |
|--------|------:|
| `PROTO` | 4 |

### `asap/` — dormant

Dependency posture:

- no live items
- keep empty unless a human explicitly wants a temporary pull lane

### `up-next/` — `B4` Near-Term Queue

Dependency posture:

- queue for notes that still need an explicit release home
- can be promoted into numbered release lanes once a note stops hand-waving
- can still be unblocked by `bad-code/` paydown, `v17.0.0/` completion, or
  selective promotion into `v18.0.0/` through `v21.0.0/`

Prefix counts:

| Prefix | Count |
|--------|------:|
| `CC` | 1 |
| `DX` | 17 |
| `NDNM` | 4 |
| `PERF` | 4 |
| `PROTO` | 14 |
| `TRUST` | 1 |
| `TS` | 1 |
| `VIZ` | 1 |

### `cool-ideas/` — `B6` Speculative Orbit

Dependency posture:

- does not block committed work by default
- blocked on promotion into another lane before it becomes a real
  prerequisite

Prefix counts:

| Prefix | Count |
|--------|------:|
| `DX` | 43 |
| `IDEA` | 6 |
| `INFRA` | 1 |
| `PERF` | 8 |
| `PROTO` | 24 |
| `THEORY` | 1 |
| `TRUST` | 3 |
| `VIZ` | 8 |

## Next Metadata Moves

The dependency map above is enough to reason across the full backlog
today, but it also makes the cleanup sequence clear:

1. Normalize frontmatter on `inbox/`, backlog-root notes, and any new
   release-lane promotions.
2. Keep `v17.0.0/` and `v18.0.0/` as the most explicit hand-authored
   dependency graphs.
3. Add `id` fields to `bad-code/` in invariant bundles instead of one
   giant sweep.
4. Promote `up-next/` notes into numbered release lanes as soon as they name
   a real release home, then add explicit edges only when the note itself
   justifies them.
5. Leave `cool-ideas/` mostly lane-inherited until promotion to avoid
   graph theater.
