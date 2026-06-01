# v17 residual backlog triage

Triage date: 2026-06-01

This note records which archived v17 residual cards still have live successors
after the shipped v17 lane was moved out of the active backlog.

Archived notes remain source material. A card only becomes live work again when
there is an active successor under `docs/method/backlog/`.

## Rehomed into active backlog

| Archived card | Active successor | Triage read |
|---------------|------------------|-------------|
| `API_readonly-receipts-release-note` | `docs/method/backlog/DX_readonly-receipts-docs.md` | Still a small docs-DX follow-up. Runtime and types use readonly receipt arrays; public docs should say that directly. |
| `CLI_missing-commands` | `docs/method/backlog/up-next/CLI_missing-commands.md` | Still relevant, but with `query` removed from the missing list and the old CLI-agent blocker dropped. |
| `INFRA_substrate-upgrade-tool` | `docs/method/backlog/up-next/INFRA_substrate-upgrade-tool.md` | Still relevant. The upgrader exists, but production runtime still carries legacy substrate fallback branches. |
| `INFRA_multipackage-publish-pipeline` | `docs/method/backlog/up-next/INFRA_multipackage-publish-pipeline.md` | Still relevant as the publish prerequisite for real workspace package extraction. |
| `INFRA_extract-warp-orset-package-post-publish` | `docs/method/backlog/up-next/INFRA_extract-warp-orset-package-post-publish.md` | Still relevant after the multi-package publish pipeline exists. |
| `INFRA_extract-warp-kernel-package-post-publish` | `docs/method/backlog/up-next/INFRA_extract-warp-kernel-package-post-publish.md` | Still relevant after `warp-orset` is real. Fixed the downstream edge to the `-post-publish` adapter card. |
| `INFRA_extract-warp-adapters-package-post-publish` | `docs/method/backlog/up-next/INFRA_extract-warp-adapters-package-post-publish.md` | Still relevant after `warp-kernel` is real. |
| `MCP_warp-server` | `docs/method/backlog/up-next/MCP_warp-server.md` | Still relevant, but should target current public surfaces and current MCP boundary choices rather than the old v17 CLI plan. |

## Kept archived as completed or stale v17 launch work

| Archived card | Triage read |
|---------------|-------------|
| `API_migrate-consumers-to-capabilities` | Shipped per v17 release ledger. |
| `CLI_agent-native-output` | The CLI is TypeScript and has structured `--json` / `--ndjson` plumbing. Any remaining typed handler cleanup should be filed as fresh debt, not this old v17 card. |
| `DX_architecture-md-js-extensions` | Stale TypeScript migration docs cleanup. Current docs and tests now cover the public API/doc shape. |
| `DX_conceptual-overview-query-pseudocode` | Stale docs cleanup; current docs should be audited through docs-DX notes, not this v17 card. |
| `DX_contributing-md-js-to-ts` | Stale TypeScript migration cleanup. |
| `DX_docs-readme-stale-paths` | Stale docs cleanup; current stale-path work belongs in docs-DX guardrails. |
| `DX_package-json-description-alignment` | Package description has moved on with the v18 worldline-first description. |
| `DX_security-md-v17-api` | Superseded by current docs-DX/security sync work. |
| `DX_warpapp-deprecation-warning` | Superseded by current legacy API deprecation docs and tests. |
| `GOD_materialize-controller` | Shipped per v17 release ledger; remaining materialization debt is represented by newer invariant cards. |
| `GOD_query-controller` | Shipped per v17 release ledger; remaining query debt is represented by newer invariant cards. |
| `GOD_strand-service` | Shipped per v17 release ledger; remaining strand debt is represented by newer invariant cards. |
| `INFRA_git-cas-adapter-parity` | Shipped per v17 release ledger. |
| `INFRA_plumbing-violations` | Superseded by active bad-code notes such as `HEX_cli-hook-installer-raw-git-bypass` and `HEX_scripts-raw-git-subprocess-policy-gap`. |
| `PORT_runtime-helper-wrapper-seams` | The archived note already records cycle 0068 as satisfying the cut. Static-test residue is tracked by current bad-code notes. |
| `PROTO_purge-boundary-leaks` | Too broad and stale as a live card. Current boundary/cast/model debt is tracked through rule-scoped quarantines and invariant bad-code notes. |
| `PROTO_purge-fake-models` | Too broad and stale as a live card. Current fake-model debt belongs in model-specific bad-code and quarantine manifests. |
| `PROTO_purge-import-law` | Too broad and stale as a live card. Current import-law debt belongs in active bad-code or policy gates. |
| `SLUDGE_host-bag-injection` | Still a real smell in places, but the live planning surface is newer invariant notes such as `OWN_runtimehost-500-loc-regression`, `PORT_half-deleted-materialization-seam`, and runtime-host static-test debt. |
| `TS_publish-pipeline` | Root single-package release preflight exists. The live successor is the multi-package publish pipeline card. |
| `TS_ssts-conformance-suite` | Superseded by active `docs/method/backlog/cool-ideas/DX_ssts-conformance-suite.md`. |
| `TS_wave-01-codec` | Shipped per v17 release ledger. |
| `TS_wave-02-trust` | Shipped per v17 release ledger. |
| `TS_wave-03-dag-provenance` | Shipped per v17 release ledger. |
| `TS_wave-04-state-query` | Shipped per v17 release ledger. |
| `TS_wave-05-controllers` | Shipped per v17 release ledger. |
| `TS_wave-06-sync` | Shipped per v17 release ledger. |
| `TS_wave-07-index-small` | Shipped per v17 release ledger. |
| `TS_wave-08-strand-index-big` | Shipped per v17 release ledger. |
| `TS_wave-09-gods-and-monsters` | Shipped per v17 release ledger. |

## Release posture

The rehomed notes are not automatically v18 blockers. They now live in backlog
root or `up-next/`, which means they require an explicit pull or release-lane
promotion before they can block `v18.0.0`.
