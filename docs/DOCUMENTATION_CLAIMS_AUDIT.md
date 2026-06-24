---
title: Temporary documentation claims audit
status: temporary-planning
created: 2026-06-24
last_updated: 2026-06-24
audit_baseline: df82aeead209
source_authority: source-code-only
delete_after: true claims are consolidated into root artifacts and docs/topics
---

# Temporary documentation claims audit

This is a planning artifact. Do not turn it into a permanent source of truth.
Its job is to extract current documentation claims, validate them against source
code only, decide which facts are worth keeping, and then disappear after the
docs are consolidated.

The cleanup target is:

- root artifacts: `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`;
- user and operator bulk: `docs/topics/`;
- generated or coverage-checked reference for exact API, CLI, schema, and error
  facts;
- contributor/process material kept out of the user-facing path.

## Audit rules

1. Markdown files are never evidence for product behavior.
2. Evidence must cite source, scripts, package metadata, tests, or generated
   runtime/configuration code.
3. Evidence anchors use `path#line@git-sha`; line ranges are used only when a
   claim needs adjacent declarations.
4. A claim is worth keeping only if it is useful to a reader task and source
   evidence supports it.
5. Historical design, retro, release, and archive documents are not current
   product documentation unless a claim is promoted into an active topic.

## Confidence scale

| Score | Meaning |
| ---: | --- |
| 1.00 | Direct source authority supports the claim. |
| 0.80 | Source supports the claim, but examples or full behavior need executable validation. |
| 0.60 | Source partially supports the claim; docs need narrowing. |
| 0.40 | Design-intent or docs-ahead claim; not yet supported as product behavior. |
| 0.00 | Source contradicts the claim; cut or rewrite. |

## Corpus index

The repository contains 1,154 Markdown files at the audit baseline. Most are
historical cycle evidence, not current product docs.

| Bucket | Count | Audit handling | Fate |
| --- | ---: | --- | --- |
| Root repo docs | 11 | Standard repo artifacts plus contributor entrypoints. | Keep only standard artifacts and required policies in the top-level path. |
| `docs/` root | 28 | Current policy, glossary, doctrine, and archived accuracy files. | Keep process docs separate; consolidate product claims into topics. |
| `docs/topics/` | 10 | Active user/operator documentation. | Primary consolidation shelf. |
| `docs/archive/` | 552 | Historical evidence. | Do not claim-maintain; mine only when promoting a fact. |
| `docs/design/` | 326 | Design history and planning. | Do not expose as current docs; mine only when promoting a fact. |
| `docs/method/` | 191 | Process, retros, roadmap history. | Keep as contributor/process material; prune old status pages separately. |
| `docs/releases/` | 4 | Release evidence snapshots. | Keep as historical release artifacts. |
| `docs/invariants/` | 21 | Candidate contributor reference. | Consolidate into architecture or contributor guide if still active. |
| `docs/specs/` | 6 | Contract-bearing specs. | Keep only with evidence maps or generated validation. |
| `docs/trust/` | 2 | Operational trust docs. | Second-pass audit as operator docs. |
| `examples/` | 1 | Example index. | Keep if examples remain executable or clearly illustrative. |
| `policy/` | 1 | Quarantine policy. | Keep as contributor policy while quarantines exist. |
| `src/` | 1 | Code-adjacent subsystem README. | Move into contributor docs or archive after extraction. |

## Active document decisions

| Path | Reader-task type | Accuracy score | Fate | Roll forward | Cut |
| --- | --- | ---: | --- | --- | --- |
| `README.md` | Landing page plus short explanation | 0.86 | Keep after tightening. | Root README. | Long theory that belongs in `docs/topics/optics.md` or `docs/topics/git-substrate.md`. |
| `ARCHITECTURE.md` | Contributor explanation | 0.82 | Keep after narrowing. | Root architecture artifact. | Source tours that duplicate generated reference. |
| `CHANGELOG.md` | Release history | 0.95 | Keep. | Root changelog. | None in this audit; do not claim-audit old releases as current behavior. |
| `docs/topics/README.md` | Topic router | 0.90 | Keep. | Topic landing page. | Any future narrative duplication. |
| `docs/topics/getting-started.md` | Tutorial | 0.80 | Keep after executable example validation. | First-success tutorial. | Unsupported or untested expected outputs. |
| `docs/topics/optics.md` | Concept explanation | 0.92 | Keep. | Optics topic. | Anything implying unbounded traversal is shipped as bounded. |
| `docs/topics/observers.md` | How-to plus explanation | 0.90 | Keep. | Observers topic. | Any wording that implies redaction is cryptographic encryption. |
| `docs/topics/bounded-reads.md` | Explanation plus posture guide | 0.86 | Keep after tightening. | Bounded reads topic. | Broad claims that every query is checkpoint-tail bounded today. |
| `docs/topics/sync.md` | How-to | 0.83 | Keep. | Sync topic. | Any claim that sync materializes by default. |
| `docs/topics/cli.md` | Operator how-to | 0.88 | Keep. | CLI topic plus generated command reference. | Manual command inventory once generated reference exists. |
| `docs/topics/git-substrate.md` | Explanation plus contributor bridge | 0.78 | Keep after splitting. | Git substrate topic and contributor reference. | Deep implementation appendices that should be generated or archived. |
| `docs/topics/querying.md` | Task guide | 0.74 | Rewrite into smaller task pages. | Querying topic plus examples. | Examples that cannot be executed or source-backed. |
| `docs/topics/api-reference.md` | Reference | 0.55 | Retire or replace with generated reference. | Generated API/CLI catalog. | Stale `--view` sections and long manually maintained appendices. |
| `docs/GLOSSARY.md` | Glossary | 0.65 | Rewrite or delete after term extraction. | Inline topic definitions plus generated catalog. | Status theater not backed by runtime nouns. |
| `docs/DOCTRINE_RUNTIME_ALIGNMENT.md` | Contributor policy | 0.85 | Keep as process material. | `docs/method/` or contributor docs. | Product claims not backed by source evidence. |
| `docs/METHOD.md` | Contributor process | 0.80 | Keep out of user docs. | Method/process shelf. | Issue snapshots or volatile status claims. |
| `docs/ANTI_SLUDGE_POLICY.md` | Contributor policy | 0.80 | Keep. | Contributor/process shelf. | Duplicated policy prose across other docs. |
| `docs/ANTI_SLUDGE_DECISIONS.md` | Contributor policy decisions | 0.75 | Keep while decisions are active. | Contributor/process shelf. | Stale decision status if not linked to enforcement. |
| `docs/SYSTEMS_STYLE_TYPESCRIPT.md` | Contributor policy | 0.80 | Keep. | Contributor/process shelf. | Duplicated rules already enforced elsewhere. |
| `docs/SYSTEMS_STYLE_JAVASCRIPT.md` | Contributor policy | 0.65 | Reassess after TypeScript migration. | Contributor/process shelf or archive. | Legacy JS guidance if no longer needed. |
| `examples/README.md` | Example index | 0.75 | Keep if examples are validated. | Examples landing page. | Links to non-runnable examples. |
| `policy/quarantines/README.md` | Contributor policy | 0.80 | Keep while quarantines exist. | Policy shelf. | Obsolete quarantine instructions after paydown. |
| `src/domain/orset/README.md` | Code-adjacent subsystem note | 0.60 | Mine then move/archive. | Contributor architecture if still needed. | User-facing claims. |

## Source-backed claim ledger

| ID | Claim | Documents carrying it | Source-code evidence | Confidence | Keep/cut decision |
| --- | --- | --- | --- | ---: | --- |
| C-001 | Package identity is `@git-stunts/git-warp` at version `18.1.0`. | `README.md`, `CHANGELOG.md`, `docs/topics/api-reference.md` | `package.json#2-L4@df82aeead209`; `jsr.json#2-L4@df82aeead209` | 1.00 | Keep in root artifacts and generated reference. |
| C-002 | Runtime target is Node `>=22.0.0`. | `README.md`, `docs/topics/getting-started.md`, `docs/topics/api-reference.md` | `package.json#16-L18@df82aeead209` | 1.00 | Keep in install prerequisites. |
| C-003 | First-use application code should open a named worldline with `openWarpWorldline()`. | `README.md`, `ARCHITECTURE.md`, `docs/topics/getting-started.md`, `docs/topics/api-reference.md` | `index.ts#9-L11@df82aeead209`; `src/domain/WarpWorldline.ts#1-L7@df82aeead209`; `src/domain/WarpGraph.ts#345-L355@df82aeead209` | 1.00 | Keep. |
| C-004 | `openWarpWorldline()` accepts `worldlineName`; `graphName` is intentionally not part of the worldline options. | `README.md`, `ARCHITECTURE.md`, `docs/topics/api-reference.md` | `src/domain/WarpWorldline.ts#23-L26@df82aeead209`; `src/domain/WarpWorldline.ts#150-L159@df82aeead209`; `index.ts#22-L25@df82aeead209` | 1.00 | Keep. |
| C-005 | `WarpWorldline` exposes commit, live, seek, observer, optic, prepareOpticBasis, and coordinate surfaces. | `README.md`, `docs/topics/getting-started.md`, `docs/topics/optics.md`, `docs/topics/observers.md` | `src/domain/WarpWorldline.ts#75-L147@df82aeead209` | 1.00 | Keep; split examples by task. |
| C-006 | `openWarpGraph()` remains an advanced compatibility and diagnostic composition root with moment-grouped capabilities and flat aliases. | `ARCHITECTURE.md`, `docs/topics/api-reference.md`, `docs/topics/git-substrate.md` | `src/domain/WarpGraph.ts#1-L17@df82aeead209`; `src/domain/WarpGraph.ts#93-L113@df82aeead209`; `src/domain/WarpGraph.ts#355-L382@df82aeead209` | 1.00 | Keep as advanced/diagnostic, not quick-start. |
| C-007 | WARP substrate refs live under `refs/warp/`, including writers, checkpoints, coverage, cursor, strands, audit, and trust refs. | `README.md`, `ARCHITECTURE.md`, `docs/topics/getting-started.md`, `docs/topics/git-substrate.md`, `docs/topics/api-reference.md` | `src/domain/utils/RefLayout.ts#7-L19@df82aeead209`; `src/domain/utils/RefLayout.ts#28-L29@df82aeead209` | 1.00 | Keep in substrate explanation and generated reference. |
| C-008 | Writer refs use `refs/warp/<graph>/writers/<writerId>`. | `docs/topics/git-substrate.md`, `docs/topics/api-reference.md` | `src/domain/utils/RefLayout.ts#193-L203@df82aeead209`; `src/domain/utils/RefLayout.ts#239-L242@df82aeead209` | 1.00 | Keep in ref layout reference. |
| C-009 | Patches are written through a patch journal, stored in Git trees, committed, and the writer ref is atomically updated. | `README.md`, `ARCHITECTURE.md`, `docs/topics/git-substrate.md` | `src/domain/services/PatchCommitter.ts#108-L123@df82aeead209`; `src/domain/services/PatchCommitter.ts#137-L143@df82aeead209`; `src/infrastructure/adapters/GitGraphAdapter.ts#196-L203@df82aeead209` | 1.00 | Keep; the stale empty-tree-only source comment was corrected before this audit. |
| C-010 | Checkpoint commits carry deterministic tree state plus index/frontier/schema metadata. | `README.md`, `ARCHITECTURE.md`, `docs/topics/git-substrate.md`, `docs/topics/api-reference.md` | `src/domain/services/state/checkpointCreate.ts#202-L223@df82aeead209` | 1.00 | Keep. |
| C-011 | Bounded checkpoint-tail optic reads require a prepared checkpoint-tail basis and fail closed when the basis is absent or invalid. | `README.md`, `docs/topics/optics.md`, `docs/topics/bounded-reads.md` | `src/domain/WarpWorldline.ts#114-L146@df82aeead209`; `src/domain/services/optic/CheckpointTailBasisVerifier.ts#27-L40@df82aeead209`; `src/domain/services/optic/CheckpointTailBasisVerifier.ts#48-L80@df82aeead209`; `src/domain/services/optic/CheckpointTailBasisVerifier.ts#103-L107@df82aeead209` | 1.00 | Keep. |
| C-012 | `Optic` is a reified frozen runtime noun with target, coordinate posture, aperture posture, basis posture, support rule, and evidence posture. | `README.md`, `docs/topics/optics.md`, `docs/GLOSSARY.md` | `src/domain/services/optic/Optic.ts#48-L65@df82aeead209`; `src/domain/services/optic/WorldlineOptic.ts#20-L32@df82aeead209` | 1.00 | Keep. |
| C-013 | Worldline optics support node, node-property, neighborhood, and traversal builders; global discovery traversal is refused by support rules. | `README.md`, `docs/topics/optics.md`, `docs/topics/bounded-reads.md` | `src/domain/services/optic/WorldlineOptic.ts#35-L57@df82aeead209`; `src/domain/services/optic/NodeOptic.ts#29-L51@df82aeead209`; `src/domain/services/optic/NodePropertyOptic.ts#25-L27@df82aeead209` | 1.00 | Keep, but be precise about traversal limits. |
| C-014 | `ProjectionHandle.optic()` is only available for live or coordinate sources with a checkpoint-tail bounded basis. | `docs/topics/optics.md`, `docs/topics/bounded-reads.md` | `src/domain/services/ProjectionHandle.ts#123-L140@df82aeead209`; `src/domain/services/ProjectionHandle.ts#215-L227@df82aeead209` | 1.00 | Keep. |
| C-015 | Exact id-only queries can use checkpoint-tail optic reads; broader query shapes fall back to the delegate observer read model. | `README.md`, `docs/topics/bounded-reads.md`, `docs/topics/querying.md` | `src/domain/services/ProjectionHandle.ts#180-L198@df82aeead209`; `src/domain/services/query/CheckpointTailExactIdQueryReadModel.ts#29-L46@df82aeead209`; `src/domain/services/query/CheckpointTailExactIdQueryReadModel.ts#71-L86@df82aeead209` | 1.00 | Keep; cut any wording that implies all queries are bounded. |
| C-016 | `BoundedSupportRule` classifies exact entity, neighborhood, and global-discovery support. | `docs/topics/bounded-reads.md`, `docs/topics/querying.md`, `docs/GLOSSARY.md` | `src/domain/services/query/BoundedSupportRule.ts#46-L117@df82aeead209` | 1.00 | Keep. |
| C-017 | `CausalIndexPlan` and `SupportFragmentPlan` distinguish bounded indexed support from global fallback. | `docs/topics/bounded-reads.md`, `docs/GLOSSARY.md` | `src/domain/services/query/CausalIndexPlan.ts#50-L84@df82aeead209`; `src/domain/services/query/SupportFragmentPlan.ts#74-L80@df82aeead209`; `src/domain/services/query/SupportFragmentPlan.ts#143-L154@df82aeead209` | 1.00 | Keep in bounded-read posture docs. |
| C-018 | Runtime bounded-memory capability reporting classifies checkpoint-tail optics as transitional, graph-wide materialization as diagnostic, and legacy query arrays as legacy. | `README.md`, `docs/topics/bounded-reads.md`, `docs/GLOSSARY.md` | `src/domain/memory/createBoundedMemoryCapabilityReport.ts#15-L45@df82aeead209` | 1.00 | Keep as release posture, but avoid overclaiming completion. |
| C-019 | Observers are read-only filtered views over an aperture. | `README.md`, `docs/topics/observers.md`, `docs/topics/querying.md` | `src/domain/services/query/Observer.ts#1-L7@df82aeead209`; `src/domain/services/query/Observer.ts#101-L120@df82aeead209` | 1.00 | Keep. |
| C-020 | Apertures support `match`, `expose`, `redact`, and `basis`; redaction wins over exposure. | `README.md`, `docs/topics/observers.md`, `docs/topics/git-substrate.md` | `src/domain/types/Aperture.ts#7-L16@df82aeead209`; `src/domain/services/query/Observer.ts#83-L99@df82aeead209`; `src/domain/services/query/Observer.ts#303-L327@df82aeead209` | 1.00 | Keep; phrase as filtering, not encryption. |
| C-021 | CAS content encryption is a separate adapter policy with vault diagnostics and store/restore options. | `docs/topics/git-substrate.md`, `docs/topics/querying.md` | `src/infrastructure/adapters/CasContentEncryptionPolicy.ts#3-L13@df82aeead209`; `src/infrastructure/adapters/CasContentEncryptionPolicy.ts#79-L153@df82aeead209` | 0.80 | Keep in security topic; examples need validation. |
| C-022 | `QueryBuilder` supports match, where, outgoing/incoming traversal, select, aggregate, plan/support fragments, and run. | `docs/topics/querying.md`, `docs/topics/api-reference.md` | `src/domain/services/query/QueryBuilder.ts#166-L264@df82aeead209` | 0.90 | Keep in generated reference and task examples. |
| C-023 | `graph.query.worldline()` can pin live, coordinate, or strand read sources and returns a `ProjectionHandle`. | `docs/topics/querying.md`, `docs/topics/api-reference.md` | `src/domain/capabilities/QueryCapability.ts#27-L40@df82aeead209`; `src/domain/capabilities/QueryCapability.ts#95-L96@df82aeead209`; `src/domain/services/controllers/QueryController.ts#195-L208@df82aeead209`; `src/domain/services/controllers/QueryController.ts#388-L393@df82aeead209` | 0.90 | Keep, but validate examples. |
| C-024 | Strand APIs support descriptor lifecycle, patching, queued intents, materialization, and conflict analysis. | `docs/topics/querying.md`, `docs/topics/cli.md`, `docs/topics/git-substrate.md` | `src/domain/capabilities/StrandCapability.ts#33-L76@df82aeead209`; `src/domain/RuntimeHost.ts#621-L635@df82aeead209` | 0.90 | Keep in speculative-lane docs after example validation. |
| C-025 | `materializeSlice()` is an advanced diagnostic/provenance primitive, not the first-use application read path. | `README.md`, `docs/topics/bounded-reads.md`, `docs/topics/git-substrate.md` | `src/domain/capabilities/ProvenanceCapability.ts#18-L29@df82aeead209`; `src/domain/RuntimeHost.ts#560-L563@df82aeead209` | 1.00 | Keep. |
| C-026 | Comparison exposes `diff(options)` and graph-diff options for base/live/strand coordinates. | `docs/topics/querying.md`, `docs/topics/api-reference.md` | `src/domain/capabilities/ComparisonCapability.ts#55-L61@df82aeead209`; `src/domain/capabilities/ComparisonCapability.ts#88-L91@df82aeead209` | 1.00 | Keep in generated reference and task docs. |
| C-027 | Sync supports direct peer or HTTP sync, retries/timeouts/auth/trust options, materialization opt-in, and an explicit unsafe localhost serve flag. | `README.md`, `docs/topics/sync.md`, `docs/topics/api-reference.md` | `src/domain/capabilities/SyncCapability.ts#22-L49@df82aeead209`; `src/domain/capabilities/SyncCapability.ts#67-L89@df82aeead209`; `src/domain/capabilities/SyncCapability.ts#108-L118@df82aeead209`; `src/domain/services/controllers/SyncController.ts#322-L380@df82aeead209` | 1.00 | Keep. |
| C-028 | CLI commands are registered through a central registry and include info, check, doctor, materialize, seek, query, path, optic, history, debug, strand, verify-audit, verify-index, reindex, trust, patch, tree, bisect, install-hooks, mcp, sync, serve, fork, checkpoint, gc, and watch. | `docs/topics/cli.md`, `docs/topics/api-reference.md` | `bin/cli/commands/registry.ts#41-L68@df82aeead209`; `bin/cli/infrastructure.ts#104-L120@df82aeead209` | 1.00 | Keep, but generate the final command reference. |
| C-029 | `--view` has been removed; users should use `warp-ttd` for visualization. | `docs/topics/cli.md`; contradicted by `docs/topics/api-reference.md` | `bin/warp-graph.ts#55-L57@df82aeead209`; `bin/cli/infrastructure.ts#123-L128@df82aeead209` | 1.00 | Keep removal note; cut all `--view` availability docs from API reference. |
| C-030 | CLI JSON and NDJSON output are mutually exclusive and errors can be emitted as structured JSON/NDJSON. | `docs/topics/cli.md`, `docs/topics/api-reference.md` | `bin/warp-graph.ts#8-L13@df82aeead209`; `bin/warp-graph.ts#55-L60@df82aeead209`; `bin/warp-graph.ts#125-L142@df82aeead209` | 1.00 | Keep. |
| C-031 | Public package binaries are `warp-graph` and `git-warp`. | `README.md`, `docs/topics/cli.md`, `docs/topics/api-reference.md` | `package.json#22-L25@df82aeead209` | 1.00 | Keep. |
| C-032 | The public package exports worldline, graph, optic, observer, bounded-read, sync, comparison, and adapter surfaces from `index.ts`. | `docs/topics/api-reference.md`, `README.md` | `index.ts#231-L240@df82aeead209`; `index.ts#272-L330@df82aeead209`; `index.ts#449-L457@df82aeead209` | 0.90 | Keep only in generated API reference. |

## Claims to cut or rewrite first

| Claim | Location | Evidence | Decision |
| --- | --- | --- | --- |
| `--view` visual output is available for CLI commands. | `docs/topics/api-reference.md#L1708`, `docs/topics/api-reference.md#L1928` | `bin/warp-graph.ts#55-L57@df82aeead209`; `bin/cli/infrastructure.ts#127@df82aeead209` | Cut. The CLI topic already states the current truth. |
| The hand-written API reference is complete enough to serve as exact product reference. | `docs/topics/api-reference.md` | Public exports and command registry are source-readable at `index.ts#231-L330@df82aeead209` and `bin/cli/commands/registry.ts#41-L68@df82aeead209`, but the doc contains stale CLI behavior. | Replace with generated or coverage-checked reference. |
| Every current query path is bounded by checkpoint-tail optics. | Potential overreading in `README.md`, `docs/topics/bounded-reads.md`, `docs/topics/querying.md` | Exact id-only bounded provider exists at `src/domain/services/query/CheckpointTailExactIdQueryReadModel.ts#29-L46@df82aeead209`; fallback remains at `src/domain/services/ProjectionHandle.ts#180-L198@df82aeead209`. | Narrow to shipped exact-id support and posture roadmap. |
| Observer redaction is sufficient security or encryption. | Potential overreading in `docs/topics/observers.md`, `docs/topics/git-substrate.md`, `docs/topics/querying.md` | Redaction is aperture filtering at `src/domain/services/query/Observer.ts#83-L99@df82aeead209`; encryption is separate at `src/infrastructure/adapters/CasContentEncryptionPolicy.ts#79-L153@df82aeead209`. | Keep the warning; do not market redaction as secrecy. |
| Glossary status labels are current runtime truth. | `docs/GLOSSARY.md` | Many glossary nouns are source-backed, but status labels are manually maintained. Example runtime nouns: `Optic` at `src/domain/services/optic/Optic.ts#48-L65@df82aeead209`, `WarpWorldlineCoordinate` at `src/domain/WarpWorldlineCoordinate.ts#18-L50@df82aeead209`. | Extract stable terms, delete or generate status labels. |

## Consolidation queue

1. Cut the stale `--view` sections from `docs/topics/api-reference.md`.
2. Replace the hand-written API and CLI inventory with generated or
   coverage-checked reference data.
3. Split `docs/topics/querying.md` into smaller task guides if it keeps growing:
   direct writes, observer reads, historical reads, speculative strand reads,
   and query-builder lookup.
4. Mine `docs/GLOSSARY.md` for useful terms, move definitions into the topic
   pages that need them, then delete the standalone glossary unless it becomes
   generated.
5. Move policy and process docs out of the user path; keep links from
   `docs/topics/README.md` only where contributors need them.
6. Treat `docs/archive/`, `docs/design/`, and old retros as historical evidence.
   Do not audit every historical sentence unless it is promoted into current
   documentation.
7. Add a generated `docs/catalog.yaml` or equivalent once the document set has
   stabilized, using page type, capability, audience, status, owner, and source
   path fields.

## Deletion condition

Delete this file when the consolidation pass has:

1. moved every kept claim into `README.md`, `ARCHITECTURE.md`, `CHANGELOG.md`,
   or `docs/topics/`;
2. cut the false claims listed above;
3. opened or implemented generated reference coverage for API and CLI facts;
4. reduced glossary/status material to source-backed definitions; and
5. left no active doc cleanup decision that depends on this temporary index.
