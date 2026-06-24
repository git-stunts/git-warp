---
accuracy_report: true
schema: git-warp-doc-accuracy-v1
source_document: docs/ROADMAP.md
created: 2026-06-24
last_updated: 2026-06-24
reviewer: codex
evidence_policy: source-code-only
lifecycle: temporary_planning
planning_phase: documentation_reorganization
retire_after: recommendations_executed
status: active
score: 25
score_label: live_status_snapshot_should_be_generated
disposition: delete_or_generate
keep:
  - release_slot_policy_if_still_owned
  - historical_migration_context
  - issue_label_taxonomy_notes
roll_into:
  - docs/topics/contributor-guide.md
  - docs/generated/roadmap.md
  - GitHub milestones
cut:
  - hand_copied_issue_tables
  - live_pr_status
  - release_dashboard_text
  - vision_dependency
---

# Roadmap accuracy report

## Verdict

`ROADMAP.md` is primarily a live issue and release-status snapshot. Under the
new documentation philosophy, it should be deleted or generated from GitHub,
not maintained as prose.

Score: **25/100**.

Disposition: **delete_or_generate**.

Lifecycle rule: this report is temporary planning evidence for the docs
reorganization pass and should be deleted after roadmap status is generated or
moved to GitHub.

## Worth keeping

- Keep release-slot policy only if it remains an active contributor rule. That
  belongs in contributor/process guidance, not user docs.
- Keep historical migration context only as archive/release evidence.
- Keep label taxonomy only where it helps contributors file or triage issues.

## What to cut or rewrite

- Cut hand-copied issue tables, live PR status, open issue counts, and
  milestone status from prose. GitHub milestones and generated reports should
  own those facts.
- Cut dependency on `VISION.md`; that document is itself a retirement target.
- If a roadmap document remains, generate it and mark the generation command as
  authority.

## Roll-in recommendation

Use GitHub milestones for live planning. If a repo-local roadmap is still
useful, generate `docs/generated/roadmap.md` from GitHub and keep only durable
planning policy in a contributor topic.
