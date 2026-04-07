# AGENTS.md

## Session Start

- Think usage is agent-specific:
  - Claude agents use `claude-think`.
  - Gemini agents use `gemini-think`.
  - Other agents should avoid using think for now.
- Treat Think as memory and coordination, not as repo truth. Anchor claims to files, commands, commits, or tests.

## Git Safety

- NEVER amend commits. Make a new commit instead.
- NEVER rebase.
- NEVER force any git operation.
- NEVER use destructive cleanup or history rewrite commands like `git reset --hard`, `git clean -f`, `git checkout .`, or `git restore .`.
- This repo stores graph data as Git commits; rewriting history can destroy user data.
- At the end of each turn, stage only the specific files written in that turn. Do not use `git add -A` by default.
- If you wrote files in the turn, commit them in that turn. Do not leave your own edits staged but uncommitted.

## Process

- Read [METHOD.md](METHOD.md) and follow it.
- Backlog lives in `docs/method/backlog/` with lanes `inbox/`, `asap/`, `up-next/`, `cool-ideas/`, and `bad-code/`.
- As you work, feel free to file concrete jank, stank, or correctness smells under `docs/method/backlog/bad-code/`.
- As you work, feel free to file speculative improvements or design sparks under `docs/method/backlog/cool-ideas/`.
- Prefer small, precise backlog notes over leaving useful discoveries only in chat.
- Cycles live in `docs/design/<NNNN-slug>/`.
- Retros live in `docs/method/retro/<NNNN-slug>/`.
- Signposts are `docs/BEARING.md` and `docs/VISION.md`; update them at cycle boundaries, not mid-cycle.
- Zero tolerance for brokenness: if you encounter an error or warning in your path, fix it or surface it explicitly.

## Engineering Doctrine

- Read `docs/SYSTEMS_STYLE_JAVASCRIPT.md` before making design-level changes.
- Prefer one file per class, type, or object. If a file accumulates peer concepts, split it.
- Runtime truth wins. If something has invariants, identity, or behavior, it should exist as a runtime-backed type.
- Validate at boundaries and constructors. Constructors establish invariants and do no I/O.
- Prefer `instanceof` dispatch over tag switching.
- No `any`. Use `unknown` only at raw boundaries and eliminate it immediately.
- No boolean trap parameters. Use named option objects or separate methods.
- No magic strings or numbers when a named constant should exist.
- Hexagonal architecture is mandatory. `src/domain/` does not import host APIs or Node-specific globals.
- Wall clock is banned from `src/domain/`. Time must enter through a port or parameter.
- Domain bytes are `Uint8Array`; `Buffer` stays in infrastructure adapters.
- Public APIs should be heavily JSDoc'd. If a public surface changes, update its JSDoc in the same slice.
- No sludge. Do not leave helper corridors, fake shape trust, or transitional duplication behind at the end of a slice.

## Refactor Gates

- For any refactor slice, touched code must reach `100%` test coverage before the slice is considered done.
- Run an SSJS scorecard on every slice. Until an automated scorecard exists, use a manual checklist and require all green on touched files:
  - runtime-backed forms for new concepts
  - boundary validation stays at boundaries
  - behavior lives on the owning type/module
  - no message parsing for behaviorally significant branching
  - no ambient time or ambient entropy in domain code
  - no fake shape trust or cast-cosplay
- End each substantial slice with a journal-style progress report that states what moved, what is still ugly, and what comes next.

## Repo Context

- `@git-stunts/git-warp` is a multi-writer graph database stored on top of Git.
- Graph data is stored as commits pointing at Git's empty tree (`4b825dc642cb6eb9a060e54bf8d69288fbee4904`).
- Writers append independent patch chains; materialization deterministically merges them through CRDTs.

## Tests and Coverage

- Useful commands:
  - `npm run test:local`
  - `npm run test:coverage`
  - `npm run lint`
  - `npm run typecheck`
- Coverage ratchet policy:
  - Only `npm run test:coverage` is allowed to update coverage thresholds.
  - Targeted or ad hoc coverage runs must not rewrite `vitest.config.js`.
- Critical multi-writer regression suite: `test/unit/domain/WarpGraph.noCoordination.test.js`.

## Release Hygiene

- Full runbook: `docs/method/release.md`.
- Releases require matching versions in `package.json` and `jsr.json`.
- Update `CHANGELOG.md` for externally meaningful changes.
