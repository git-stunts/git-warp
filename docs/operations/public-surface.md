# Public capability guard

The guard for [#1050](https://github.com/git-stunts/git-warp/issues/1050) checks
every executable target in `package.json` exports against the
[accepted Optic boundary](../plans/optic-only-public-api.md). It preserves legacy
APIs until their replacement and removal under
[#1054](https://github.com/git-stunts/git-warp/issues/1054).

## What is inspected

`scripts/public-surface/PublicSurfaceScanner.ts` reads conditional exports and
fallback arrays, resolves aliases through the existing TypeScript compiler, and
compares JavaScript export names with their generated declarations. JSON data
exports are excluded. Missing files, syntax or declaration errors, unsupported
targets and wildcard maps refuse analysis.

The declaration walk follows public members, inheritance, inputs, outputs,
generic arguments, constraints, index values and declared conditional branches.
It includes dependency-owned public declarations. Private/protected members and
implementation bodies do not create public reachability. Standard library
implementations are excluded, while their supplied generic arguments remain
visible. An unconstrained `any` or `unknown` is recorded as `uninspectable-type`;
an existing allowance for such a route is not proof of its runtime contents.

An iterative worklist expands each generic declaration once and separately walks
its concrete arguments. Each export is bounded to 50,000 distinct types, 100,000
queued visits and 4,096 characters per route. Exceeding a bound refuses the scan;
it does not produce an empty pass. Implicit constructors count as public even
when the compiler supplies no declaration node for them.

Forbidden nouns include Runtime, Lane, mutable graph types, materialization,
checkpoint, frontier, basis, cut and captureCoordinate. An opaque Coordinate
permits static `parse` and instance `toString`, with hidden construction. The
exception follows aliases and does not permit additional public members.

This is a static capability guard. It does not prove arbitrary JavaScript
behavior or replace runtime and installed-consumer tests.

## Read failures and retire allowances

`policy/public-surface-ratchet.txt` contains exact rows of removal issue number,
a tab, and an encoded public identity. The four identity fields are package
subpath, export, reachable route and rule. Source line numbers are diagnostic
only; moving a declaration does not require another allowance. Multiple routes
can expose one underlying capability, so the row count is not a defect count.

- `NEW` means an exposed capability has no allowance. Remove that exposure.
- `STALE` means the exposure disappeared. Remove its exact allowance as part of
  the same change.
- A malformed or duplicate row refuses the inventory.
- A compiler/history refusal means analysis is incomplete. Repair its cause;
  do not treat it as a clean capability surface.

The ordinary Docker unit suite includes `public-surface-package.test.ts`, which
compares the built package with the inventory. Focused runs must use the same
COPY-based guarded Docker workflow as other tests. Inside that worker,
`node --experimental-strip-types scripts/public-surface/report.ts` prints the
current inventory between explicit markers. It never edits the allowance file.

The full-history CI lane also runs
`node --experimental-strip-types scripts/public-surface/check-history.ts`.
It compares complete allowance rows with `git merge-base --all origin/main HEAD`,
so growth hidden in an earlier branch commit still fails. Removed rows are
permitted; changed removal owners are additions. Missing/shallow/ambiguous
history refuses the check. The first introduction is allowed only when neither
guard nor baseline exists anywhere in the comparison base's history. Deleting
them cannot reset this condition.

The existing root declaration vocabulary gate remains independent. This guard
does not change package versions, remove public APIs or certify the planned
Warp/Optic implementation.
