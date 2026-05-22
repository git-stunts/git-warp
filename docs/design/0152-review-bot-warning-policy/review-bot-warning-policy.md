---
cycle: 0152
task_id: DX_review_bot_warning_policy
status: Planned
sponsors:
  human: James
  agent: Codex
started_at: 2026-05-22
release_home: v18.0.0
backlog:
  - docs/method/backlog/DX_review-bot-warning-policy.md
---

# Review Bot Warning Policy

## Pull

PR review bots can produce both useful findings and generic warnings.
PR #93 had both: the prototype-like path issue was valid, while the
docstring coverage warning did not map to this repository's gates.

## Hill

Contributors have a repo-visible rule for classifying review-bot
warnings as required work, false positives, or backlog fuel.

## Playback Questions

- Does the warning map to a repository script, CI check, policy doc, or
  product contract?
- If the warning is valid, what RED test or failing gate proves it?
- If the warning is false, what local evidence proves that answer?
- If the warning is not a merge blocker but still useful, where does it
  enter the backlog?

## Design

Add a contributor-facing review policy that requires:

1. Verify the warning against current code.
2. Search local scripts, workflows, and policy docs for an owning gate.
3. Fix valid issues with RED/GREEN, docs, and commit evidence.
4. Reply to false positives with file, command, and CI evidence.
5. Convert useful but non-blocking warnings into backlog notes with a
   design link.

## Non-Goals

- Do not turn generic bot suggestions into automatic policy.
- Do not silence review bots globally.
- Do not add documentation churn when no repo rule asks for it.

## Verification

- The policy doc links to the existing PR template and review hygiene
  guidance.
- Markdown lint passes.
- A future PR feedback loop can cite the policy instead of relying on
  chat-only precedent.

## SSJS Scorecard

- Runtime-backed forms: not applicable; docs/process slice.
- Boundary validation: green; process requires local evidence before
  adopting external warnings.
- Behavior ownership: green; repo gates own repo policy.
- Message parsing: green; bot text is evidence to verify, not authority.
- Ambient time or entropy: green.
- Fake shape trust or cast-cosplay: green; false positives require
  inspectable proof.

