# No Ambient Entropy

## What must remain true?

Domain code (`src/domain/`) never reads ambient randomness.
`Math.random()`, `crypto.randomUUID()`, and
`crypto.getRandomValues()` are forbidden in `src/domain/`.

All randomness in the domain must be either:
- explicitly seeded by the caller, or
- derived deterministically from stable inputs (frontier hash,
  worldline id, materialized root hash)

## Why does it matter?

Ambient entropy is a hidden input. Logging a random seed after
generating it does not make the operation deterministic. It makes
it debuggable after the damage is done.

If `verifyIndex()` uses `Math.random()` for its default seed, two
runs over the same materialized state pick different samples. The
verification is non-reproducible. If `forkName` is generated from
`Math.random()`, the fork's identity depends on when it was created,
not what it contains.

Deterministic core code produces the same output for the same input.
Ambient entropy violates this by definition.

## Paper grounding

- **Paper II, Theorem 5.1** (Tick confluence): same patches, any
  order, same result. Ambient entropy in the apply path would make
  outcomes order-dependent AND run-dependent.
- **Paper III, Remark 3.4** (Anti-tautology): patches must eliminate
  ambiguity without ambient state.
- **OG-1, Definition 1** (Observer basis): observer primitives are
  deterministic functions of trace values. Random sampling changes
  the observer's basis between runs.

## How do you check?

1. **ESLint gate (enforced on every commit)**:
   ```text
   no-restricted-syntax rules in eslint.config.js ban:
   - Math.random()
   ```
   in all `src/domain/**/*.js` files.

2. **Grep for escapes**:
   ```bash
   grep -rn "Math\.random\|randomUUID\|getRandomValues" src/domain/ --include="*.js"
   ```
   Must return only eslint-disable-guarded lines (tracked debt)
   or zero lines (target state).

3. **Seed audit**: Every function that accepts an optional seed
   parameter must derive a deterministic default when no seed is
   provided — not fall back to `Math.random()`.
