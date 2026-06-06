# AGENTS.md

## STOP — READ BEFORE GENERATING TYPESCRIPT

This repository does **not** accept vague, cast-heavy, or boundary-
leaking TypeScript. If a patch compiles but violates the policy,
**the patch is still wrong**.

The policy is binding:

- **Full policy:** [`docs/ANTI_SLUDGE_POLICY.md`](docs/ANTI_SLUDGE_POLICY.md)
- **Decisions:** [`docs/ANTI_SLUDGE_DECISIONS.md`](docs/ANTI_SLUDGE_DECISIONS.md)
- **Foundations:** [`docs/SYSTEMS_STYLE_TYPESCRIPT.md`](docs/SYSTEMS_STYLE_TYPESCRIPT.md)

Rule 0 is binding: **Runtime Truth Wins**. If runtime behavior, types,
tests, and docs disagree, fix the runtime model first and then update the
evidence. Type annotations and docs support runtime truth; they do not
override it.

### Automatic rejection list

A patch must be rejected on sight if it introduces any of the
following in non-adapter code (i.e. anywhere except
`src/infrastructure/adapters/**`):

- `any` (anywhere, including adapters)
- `as any` (anywhere, including adapters)
- `as unknown as` (anywhere)
- `unknown` (outside adapters)
- `Record<string, unknown>` (outside adapters)
- `*Like` placeholder types (`FooLike`, `BarLike`, `ThingLike`, etc.) (anywhere)
- `JSON.parse` / `JSON.stringify` (outside adapters)
- `fetch` (outside adapters)
- `process.env` (outside adapters)
- `Date.now()` / `new Date()` / `Date()` / `performance.now()` (in `src/domain/**`)
- `Math.random()` / `crypto.randomUUID()` / `crypto.getRandomValues()` (in `src/domain/**`)
- `setTimeout` / `setInterval` (in `src/domain/**`)
- raw `new Error(...)` / `new TypeError(...)` (in `src/domain/**` — extend `WarpError` instead)
- `@ts-ignore` (anywhere — use `@ts-expect-error`)
- `z.any()` (anywhere)
- Direct `import 'fs'`, `'path'`, `'http'`, `'https'`, `'net'`,
  `'tls'`, `'stream'`, `'child_process'`, `'crypto'`, `'os'`,
  `'buffer'`, `'node:*'` in `src/domain/**` or `src/ports/**` — use a port
- Direct import from `src/infrastructure/**` in `src/domain/**` or `src/ports/**` — use a port

### Quarantine rules

Pre-existing violations live in
`policy/quarantines/0025{A,B,C,D}-*.json` manifests. These are
**temporary, paydown-destined**. They are not a ratchet baseline.

- **Quarantines are rule-scoped.** A file may be quarantined for
  `as unknown as` without receiving a free pass on `*Like`.
- **If you touch a quarantined file**, the
  `quarantine-graduate-check` CI gate fails unless you either:
  1. Remove the file from its quarantine manifest by fixing the
     sludge, OR
  2. Replace the file-level quarantine with narrow **inline**
     suppressions, each referencing a ticket number.
- The check uses `git merge-base <base> HEAD` to compute the
  touched-file set. Never `HEAD~1`.

### Required model

Generate only:

- explicit domain concepts (named classes with validated
  constructors, `Object.freeze`, `instanceof` dispatch)
- runtime-honest TypeScript (types document reality; parsers gate
  untrusted input)
- constructor-injected ports for external capabilities
- domain object construction in core only when it establishes validated
  runtime truth
- boring adapters and sharp core logic
- discriminated unions and explicit result types instead of
  boolean-flag bags
- expected failures as return values, not exceptions

Do **not** generate:

- clever sludge
- "good enough" sludge
- compile-time theater
- construction of infrastructure adapters, host APIs, persistence
  implementations, wall clocks, or entropy sources inside core
- puddle-assembly object construction (`thing.a = ...; if (...) thing.b = ...`)
- `utils.ts`, `helpers.ts`, `misc.ts`, `common.ts` — name the concept

When the boundary shape is unclear, **define a port or a transport
DTO and stop there**. Do not hallucinate fake domain models.

---

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
- Cycle-start draft pull requests are allowed and expected. After the design
  doc commit is pushed, open a draft PR that references the issue, label the
  issue `work-in-progress`, and keep the PR draft until playback, acceptance
  evidence, closeout, and validation make the branch ready to merge into `main`.

## Process

- Read [METHOD](docs/METHOD.md) and follow it.
- Backlog lives in `docs/method/backlog/` with lanes `inbox/`, `asap/`, `up-next/`, `cool-ideas/`, and `bad-code/`.
- As you work, feel free to file concrete jank, stank, or correctness smells under `docs/method/backlog/bad-code/`.
- As you work, feel free to file speculative improvements or design sparks under `docs/method/backlog/cool-ideas/`.
- Prefer small, precise backlog notes over leaving useful discoveries only in chat.
- Cycles live in `docs/design/<NNNN-slug>/`.
- Retros live in `docs/method/retro/<NNNN-slug>/`.
- Signposts are `docs/BEARING.md` and `docs/VISION.md`; update them at cycle boundaries, not mid-cycle.
- Zero tolerance for brokenness: if you encounter an error or warning in your path, fix it or surface it explicitly.
- End every turn with the compact progress footer:

  ```text
  ═══ ⋆★⋆ Progress Report ⋆★⋆ ═══

  <goalpost name>
  <progress bar> <percent> (<done>/<total> slices)

  - [x] <completed slice>
  - [ ] <open slice>

  ⎇ <branch> +<ahead>/-<behind>
  <pr-icon> <pr-status>
  ```

  Compute `+<ahead>/-<behind>` against the active merge target, normally
  `origin/main`, using local refs unless the turn already fetched. Keep the PR
  line compact:

  - `🚫 none` when no PR exists.
  - `📤 [#N](url)` when a PR is open.
  - `📝 [#N](url)` when a PR is draft.
  - `🏁 [#N](url)` when a PR was merged.
  - `🐇 [#N](url)` when waiting for Code Rabbit.
  - `🧪 [#N](url)` when CI is not finished yet.

## Engineering Doctrine

- Read [`docs/ANTI_SLUDGE_POLICY.md`](docs/ANTI_SLUDGE_POLICY.md) and `docs/SYSTEMS_STYLE_TYPESCRIPT.md` (SSTS) before making design-level changes.
- Prefer one file per class, type, or object. If a file accumulates peer concepts, split it.
- Runtime truth wins. If something has invariants, identity, or behavior, it should exist as a runtime-backed type.
- Validate at boundaries and constructors. Constructors establish invariants and do no I/O.
- Dependency injection is mandatory for external capabilities. Core may
  construct domain objects, but not adapters, host services, persistence
  implementations, wall clocks, or entropy sources.
- Encoding and decoding stay in adapters, codec ports, or explicitly named
  boundary reader modules. Core behavior branches on validated domain
  objects, not raw decoded shapes.
- Prefer `instanceof` dispatch over tag switching.
- No `any`. No `unknown` outside parser functions. No `as` assertions. No `enum`.
- `interface` is for ports only. Domain concepts are classes.
- No boolean trap parameters. Use named option objects or separate methods.
- No magic strings or numbers when a named constant should exist.
- Hexagonal architecture is mandatory. `src/domain/` does not import host APIs or Node-specific globals.
- Wall clock is banned from `src/domain/`. Time must enter through a port or parameter.
- Domain bytes are `Uint8Array`; `Buffer` stays in infrastructure adapters.
- Max file size: 500 LOC (source), 800 LOC (test), 300 LOC (bin/scripts).
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
- End each substantial slice with a funny progress report that explains what mess we got ourselves into, what mess we got ourselves out of, and what comes next. Battle report style is optional.

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
