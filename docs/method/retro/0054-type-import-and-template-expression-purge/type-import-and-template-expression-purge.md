# Retro — 0054 Type-Import And Template-Expression Purge

## Outcome

`hill met`

The repo no longer lies about these two hygiene rules.

They are now active in `eslint.config.ts`, documented as active in
`docs/ANTI_SLUDGE_DECISIONS.md`, and backed by explicit rule-scoped quarantine
manifests for the remaining residue.

## What changed

- activated `@typescript-eslint/consistent-type-imports`
- activated `@typescript-eslint/restrict-template-expressions`
- took the autofixable type-import cleanup wins
- added:
  - `policy/quarantines/HYGIENE-consistent-type-imports.json`
  - `policy/quarantines/HYGIENE-restrict-template-expressions.json`
- added a docs/config/manifests ratchet at
  `test/unit/scripts/type-import-hygiene-shape.test.ts`

## Why this is better

Before this cycle, the repo had policy/config drift:

- the decisions doc implied the rules were present
- the lint config still treated them as deferred

Now the posture is inspectable and finite.

Contributors can see:

- the rules are on
- the exact remaining residue
- where that residue lives

without reconstructing history from chat or stale backlog prose.

## Next

Let future slices graduate the two hygiene quarantine manifests file by file
instead of reopening the same "are these rules real?" question, and keep the
`v17` cleanup line focused on live runtime and API debt rather than stale sludge
cards.
