---
title: "Resolve the type-import/template-expression hygiene drift and activate the rules honestly"
cycle: "0054-type-import-and-template-expression-purge"
---

# Type-Import And Template-Expression Purge

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

The repo currently says two incompatible things:

- `docs/ANTI_SLUDGE_DECISIONS.md` lists
  `@typescript-eslint/consistent-type-imports` and
  `@typescript-eslint/restrict-template-expressions` as rules added from the
  bundle
- `eslint.config.ts` still says both rules are deferred and does not enforce
  them

That is planning and policy drift.

At the same time, the original backlog card is directionally correct: blindly
hot-enabling the rules would create a scattered hygiene fire across the repo.

This cycle exists to make the posture truthful and then close as much of the
actual residue as a bounded slice allows.

## Hill

A contributor can now answer, from repo truth alone, whether these two hygiene
rules are active, which pre-existing files are still quarantined, and why the
remaining residue is finite and owned.

## Playback questions

### Agent

- Do `eslint.config.ts` and `docs/ANTI_SLUDGE_DECISIONS.md` now agree on the
  status of the two rules?
- If quarantines are needed, are they narrow, rule-scoped, and legible?
- Can I show the remaining violations without relying on chat history?

### Human

- Is it obvious whether the rules are active now?
- If some residue remains quarantined, is it obvious where to find it and how
  it gets paid down?

## Accessibility / assistive reading posture

Relevant. The repo should not require a contributor to mentally diff policy docs
against lint config to understand whether a hygiene rule is real.

## Localization / directionality posture

Not especially relevant. This is lint-policy and residue bookkeeping work.

## Agent inspectability / explainability posture

Relevant. The cycle should leave:

- explicit ESLint rule config
- explicit decision-doc wording
- quarantine manifests if needed
- test evidence that the docs/config/manifests agree

## Non-goals

- No opportunistic rewrite of unrelated hygiene rules
- No fake "fix every type import in the repo" mega-slice if quarantines are the
  truthful bounded bridge
- No mixing this cycle with the import-law purge chain beyond keeping the docs
  consistent

## Core diagnosis

The real bug is not just "some type imports are messy."

The real bug is that the repo lost agreement between:

- the decision memo
- the actual ESLint configuration
- the backlog note describing what still needs to happen

Until those three surfaces agree, contributors cannot tell whether a failing
site is a policy bug, a config omission, or a known quarantine.

## Design

### 1. Make the policy/config status truthful

`eslint.config.ts` and `docs/ANTI_SLUDGE_DECISIONS.md` must stop disagreeing
about whether these rules are active.

### 2. Enable both rules as errors

Use the bounded settings already named in the backlog note:

- `@typescript-eslint/consistent-type-imports`
  - `prefer: "type-imports"`
  - `fixStyle: "inline-type-imports"`
- `@typescript-eslint/restrict-template-expressions`
  - `allowAny: false`
  - `allowBoolean: false`
  - `allowNever: false`
  - `allowNullish: false`
  - `allowNumber: true`
  - `allowRegExp: false`

### 3. Quarantine the remaining residue if the bounded slice cannot clear it all

If pre-existing violations remain after the bounded cleanup:

- add small, rule-scoped hygiene manifests
- keep the manifests legible
- record the residue as finite rather than leaving the rules deferred

### 4. Add a docs/config ratchet

The repo should fail if the decisions doc, lint config, and hygiene manifests
fall out of agreement again.

## Test plan

### RED

Add a docs/config shape test that fails until:

- the decisions doc no longer describes these rules as merely deferred
- the ESLint config actually enables both rules
- any hygiene quarantine manifests that exist are named explicitly

### GREEN

- enable the rules
- autofix what is cheap and truthful
- add small quarantine manifests if needed
- update the decisions doc and backlog truth

### Witness

- `npx eslint src bin --format json > /tmp/full-lint-report-0054.json || true`
- parse `/tmp/full-lint-report-0054.json` and confirm:
  - `@typescript-eslint/consistent-type-imports` => `0`
  - `@typescript-eslint/restrict-template-expressions` => `0`
- `npm run typecheck`
- targeted docs/config ratchet test
- `git diff --check`

## Playback

### Agent

- Yes. `eslint.config.ts` and `docs/ANTI_SLUDGE_DECISIONS.md` now agree that
  both rules are active hygiene rules.
- Yes. The remaining residue is explicit, rule-scoped, and legible in:
  - `policy/quarantines/HYGIENE-consistent-type-imports.json`
  - `policy/quarantines/HYGIENE-restrict-template-expressions.json`
- Yes. The full lint report now shows zero live violations for these two rules
  outside the quarantine bridge.

### Human

- Yes. It is now obvious from repo truth that the rules are active.
- Yes. If a contributor wants the remaining residue, the quarantine manifests
  give the exact file list instead of leaving the rules half-deferred in prose.

### Verdict

`hill met`

## Drift check

No negative drift against the hill.

One explicit witness drift:

- `npm run lint` is not a truthful cycle gate right now because the repo
  already carries unrelated baseline lint failures outside this hygiene slice
- the cycle therefore used the full ESLint JSON report filtered to these two
  rules as the real witness

That drift is acceptable because it makes the verification target more honest,
not less.
