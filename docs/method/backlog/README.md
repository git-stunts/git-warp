# backlog

This README is the canonical dependency map for the repo-visible
backlog.

It exists because the METHOD MCP surface is currently inconsistent on
this repo: `method_doctor` recognizes the workspace and returns
diagnostics, while `method_status` and
`method_backlog_dependencies` reject the same path as "not a METHOD
workspace." Until that drift is fixed, repo-truth parsing of
`docs/method/backlog/**/*.md` is the authoritative planning surface.

## Snapshot

Current repo truth after adding the METHOD tooling note:

| Metric | Count |
|--------|------:|
| Live backlog items | 382 |
| Root backlog items | 31 |
| `asap/` | 4 |
| `bad-code/` | 139 |
| `cool-ideas/` | 93 |
| `inbox/` | 5 |
| `up-next/` | 53 |
| `v17.0.0/` | 57 |
| Items with YAML frontmatter | 90 |
| Items without YAML frontmatter | 292 |
| Items with explicit `id` | 75 |
| Items declaring dependency fields | 63 |
| Items with non-empty explicit dependency edges | 47 |

## Dependency Law

The backlog currently mixes two systems:

- **Explicit graph edges** on a minority of notes via `id`, `blocks`,
  and `blocked_by`.
- **Lane inheritance** for everything else.

Until frontmatter is normalized repo-wide, lane inheritance is the
canonical rule for all notes that do not already declare explicit
edges.

### Dependency Bands

| Band | Scope | Meaning | May Be Blocked By |
|------|-------|---------|-------------------|
| `B0` | `inbox/` | Raw capture. No commitment, no scheduling, no downstream guarantees. | Triage only. |
| `B1` | backlog root | Unlaned maintenance and reference work. Needs classification or direct pull before it should block committed work. | `B0` or direct human pull. |
| `B2` | `bad-code/` | Foundational debt and invariant repair. This lane can legitimately block release or execution work. | `B0`, `B1`, or lower-level debt in `B2`. |
| `B3` | `v17.0.0/`, `asap/` | Current committed delivery work. Explicit per-note edges win here. | `B2`, same-band work, or explicit edges. |
| `B4` | `up-next/` | Near-term follow-through after current committed work. | `B2`, `B3`, or explicit same-lane edges. |
| `B5` | `cool-ideas/` | Speculative orbit. These notes do not block committed lanes until promoted. | Promotion into another lane. |

### Lane Contracts

| Lane | Band | Contract |
|------|------|----------|
| `inbox/` | `B0` | Anything here is blocked on triage, not implementation. |
| backlog root | `B1` | These notes are real work, but still need lane assignment or an explicit pull decision. |
| `bad-code/` | `B2` | Invariant debt can block `v17.0.0`, `asap`, and `up-next`. |
| `v17.0.0/` | `B3` | This is the active release graph. Use explicit frontmatter edges where present. |
| `asap/` | `B3` | Immediate pull candidates; may depend on `bad-code` or `v17.0.0` substrate work. |
| `up-next/` | `B4` | Queue behind active release and immediate work unless explicitly promoted. |
| `cool-ideas/` | `B5` | Never blocks committed lanes until moved into a committed lane. |

### Interpretation Rule

For any note without explicit `blocked_by` metadata:

1. Inherit the dependency band of its lane.
2. Treat lower-numbered bands as eligible prerequisites.
3. Treat higher-numbered bands as downstream or non-blocking.
4. If a note is promoted into a new lane, it inherits the new lane's
   band immediately.

This gives every live note a dependency posture today without pretending
that the current frontmatter coverage is complete.

## Explicit Graph Already In Files

The existing frontmatter graph is concentrated in `v17.0.0/`, with a
small number of nodes in `up-next/`, `cool-ideas/`, and `bad-code/`.

Current explicit-graph totals:

- `75` notes define an `id`
- `63` notes declare `blocks` or `blocked_by` fields
- `47` notes currently name at least one non-empty upstream or
  downstream edge

### Current Top Outbound Blockers

These notes currently block the most explicitly linked downstream work:

| Note ID | Explicit `blocks` Count |
|---------|------------------------:|
| `CROSS_shared-provider-interfaces` | 6 |
| `API_capability-interfaces` | 3 |
| `PROTO_materialize-integration` | 3 |
| `PROTO_shadow-trie-orset` | 3 |
| `GOD_incremental-index-updater` | 2 |
| `PERF_trie-geometry-and-memory-profile` | 2 |
| `PROTO_git-trie-store-port` | 2 |
| `PROTO_index-builder-trie-iteration` | 2 |
| `PROTO_state-session-async` | 2 |
| `TS_convert-remaining-js` | 2 |

### Current Most-Blocked Nodes

These notes currently accumulate the most explicit prerequisites:

| Note ID | Explicit `blocked_by` Count |
|---------|----------------------------:|
| `API_migrate-consumers-to-capabilities` | 7 |
| `INFRA_extract-warp-orset-package-post-publish` | 4 |
| `PROTO_shadow-trie-orset` | 4 |
| `PROTO_state-session-async` | 4 |
| `API_observer-readable-receipts` | 3 |
| `PERF_trie-geometry-and-memory-profile` | 3 |
| `PROTO_materialize-integration` | 3 |
| `TS_publish-pipeline` | 3 |
| `API_warpgraph-factory` | 2 |
| `GOD_query-controller` | 2 |

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

- may legitimately block `v17.0.0/`, `asap/`, and `up-next/`
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

Canonical lane readme:

- [v17.0.0/README.md](v17.0.0/README.md)

Prefix counts:

| Prefix | Count |
|--------|------:|
| `API` | 5 |
| `CROSS` | 1 |
| `GOD` | 6 |
| `HYGIENE` | 2 |
| `INFRA` | 8 |
| `PERF` | 2 |
| `PROTO` | 13 |
| `SLUDGE` | 5 |
| `TRUST` | 1 |
| `TS` | 14 |

### `asap/` — `B3` Immediate Pull Candidates

Dependency posture:

- same band as `v17.0.0/`
- may depend on release substrate work or foundational `bad-code/`

Items:

- [INFRA_uniform-git-cas.md](asap/INFRA_uniform-git-cas.md)
- [PROTO_live-holographic-strands.md](asap/PROTO_live-holographic-strands.md)
- [PROTO_observer-plan-reading-envelopes.md](asap/PROTO_observer-plan-reading-envelopes.md)
- [PROTO_witnessed-suffix-admission-shells.md](asap/PROTO_witnessed-suffix-admission-shells.md)

### `up-next/` — `B4` Near-Term Queue

Dependency posture:

- queue behind active release and immediate work unless explicit edges
  say otherwise
- can be unblocked by `bad-code/` paydown or `v17.0.0/` completion

Prefix counts:

| Prefix | Count |
|--------|------:|
| `CC` | 1 |
| `CLI` | 2 |
| `CORE` | 1 |
| `DX` | 17 |
| `MCP` | 1 |
| `NDNM` | 4 |
| `PERF` | 4 |
| `PROTO` | 20 |
| `TRUST` | 1 |
| `TS` | 1 |
| `VIZ` | 1 |

### `cool-ideas/` — `B5` Speculative Orbit

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
| `PROTO` | 23 |
| `THEORY` | 1 |
| `TRUST` | 3 |
| `VIZ` | 8 |

## Next Metadata Moves

The dependency map above is enough to reason across the full backlog
today, but it also makes the cleanup sequence clear:

1. Normalize frontmatter on `inbox/`, `asap/`, and backlog-root notes.
2. Keep `v17.0.0/` as the most explicit hand-authored dependency graph.
3. Add `id` fields to `bad-code/` in invariant bundles instead of one
   giant sweep.
4. Promote `up-next/` notes into explicit edges only when they become
   current-cycle blockers.
5. Leave `cool-ideas/` mostly lane-inherited until promotion to avoid
   graph theater.
