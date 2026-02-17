# GRAVEYARD — Rejected Backlog Items

> Items buried here were triaged on 2026-02-17 and rejected with cause.
> If you want to resurrect something, open an RFC. No zombie backlog.

---

| ID | Tier | Item | Rejected | Rationale |
|----|------|------|----------|-----------|
| **B5** | D | **EXPERIMENTAL SYNC-BUILDER** — Lamport prefetch model behind explicit flag | 2026-02-17 | Explicitly cut from v2.0 for safety. Roadmap says "requires separate RFC." The risky semantic rewrite was removed on purpose — not eligible for core release without its own RFC, invariants doc, soak period, and rollback proof. No RFC filed. |
| **B6** | B/C | **RUST CORE / WASM** — Rewrite performance-critical paths in Rust | 2026-02-17 | Roadmap prerequisite: "pursue only when measured perf ceiling is proven in JS path." No benchmark has been produced demonstrating JS cannot do the job. Reject stands until someone ships evidence, not vibes. |
| **B13** | C | **ESLINT: NO-STRING-DUPLICATION** — Custom rule flagging long error messages appearing 3+ times | 2026-02-17 | Error message constants are already extracted where it matters (`E_NO_STATE_MSG`, etc.). A custom lint rule for residual duplication is over-engineering for the remaining cases. If string drift becomes a recurring bug source, revisit. |
| **B17** | C | **`TrustRecordSchema.strict()` VARIANT** — Reject unknown keys in trust record envelope | 2026-02-17 | Schema drift is better caught by B42 (CI `.d.ts` signature validation with semantic shape checks). Zod `.strict()` on record schemas creates upgrade friction (new optional fields break old readers) for negligible safety gain. The trust record format is already frozen by golden fixtures. |
| **B18** | C | **ZOD CONVENTION: TRIM BEFORE MIN** — Add note to CLAUDE.md about `.trim()` before `.min()` | 2026-02-17 | This is a coding style preference, not a backlog item. If desired, add directly to CLAUDE.md — doesn't warrant tracking, estimation, or milestone placement. |
| **B25** | C | **ESLINT: TEST CATCH-BLOCK ASSERTION GUARD** — Custom rule flagging try/catch without `expect.assertions()` | 2026-02-17 | B24 (done, daf4adb) fixed the immediate case. `expect.assertions()` is already the convention. Building a custom ESLint rule or vitest plugin for a one-time issue that's been resolved is disproportionate effort. |
| **B45** | C | **TYPE-LEVEL `.d.ts` CONFORMANCE TEST** — `satisfies` / `Parameters<>` / `ReturnType<>` type checks | 2026-02-17 | Redundant with B42 (CI `.d.ts` signature validation), provided B42 acceptance criteria require semantic shape validation (parameter types + return types), not just export name matching. B42 criteria tightened accordingly. |
