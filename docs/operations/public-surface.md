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
permits static `parse(text: string): Coordinate` and instance `toString(): string`,
with hidden construction. Every overload must preserve that signature; data
members, extra inputs, generic operations, explicit receivers and structured
results are not exempt merely because they use an allowed name. The exception
follows aliases and does not permit additional public members.
Export renames, type declarations and constructor variables resolve to the same
underlying Coordinate class identity before any export is walked. A non-class
Coordinate representation refuses analysis instead of silently receiving the
opaque exception or branding an unrelated standard-library type as Coordinate.
This identity pass follows public declaration references, including chains of
renamed wrappers, and refuses more than 50,000 reachable symbols per package.
It inspects each immediate import/export alias hop before the compiler resolves
the final declaration, so intermediate Coordinate names retain their contract.
An unrelated, unreachable alias does not establish public Coordinate identity.
Coordinate constructor signatures must be private, including when only an
instance is reached through a receipt or a subclass. Protected construction is
not hidden: a consumer-defined subclass can make it publicly callable.

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
them cannot reset this condition. The bootstrap check uses `git log --full-history`
so a merge that retains an unguarded parent's tree cannot hide the other parent's
earlier guard.

The existing root declaration vocabulary gate remains independent. This guard
does not change package versions, remove public APIs or certify the planned
Warp/Optic implementation.
