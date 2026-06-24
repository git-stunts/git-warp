---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/README.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 60
score_label: useful_navigation_wrong_shape
disposition: replace
keep:
  - navigation_role
  - live_docs_warning
  - start_here_grouping
roll_into:
  - docs/topics/index.md
  - README.md
cut:
  - canonical_map_claim
  - top_level_doc_router_duplication
  - process_history_sections
---

# Documentation index accuracy report

## Verdict

`docs/README.md` is useful as a warning that not every Markdown file is current,
but its "canonical map" role conflicts with the new docs strategy. It should be
replaced by a small topics router or generated catalog after consolidation.

Score: **60/100**.

Disposition: **replace**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after the index recommendations are
executed.

## Worth keeping

- Keep the reader-facing warning that the corpus contains current docs,
  design history, and archive material.
- Keep a small "start here" router, but make it route to root `README.md` and
  focused `docs/topics/*` pages.
- Keep contributor and release-process links only if they remain live and
  have one primary reader job.

## What to cut or rewrite

- Cut the "canonical map" claim. During consolidation, the live map should be
  the topic tree plus an eventual generated catalog, not a hand-curated page.
- Cut links to soon-retired top-level guide sprawl after each page has an
  accuracy report and a roll-in target.
- Cut process-history and archive navigation from the primary user index. Keep
  historical material discoverable through archive indexes or Git history.

## Roll-in recommendation

Replace this file with either `docs/topics/index.md` or a generated
`docs/catalog.yaml` plus a short human landing page. The router should group by
reader job: start, use, look up, understand, troubleshoot, and contribute.
