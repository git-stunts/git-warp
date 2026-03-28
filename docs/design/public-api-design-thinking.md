# IBM Design Thinking — `git-warp` Public API And README

Status: ACTIVE

Legend: Observer Geometry

Cycle: OG-010

## Why This Cycle Exists

Multiple higher-layer applications have repeated the same failure mode on top of
`git-warp`:

- materialize too much graph history into application memory
- write app-local graph read logic
- write app-local traversal logic
- treat whole-graph enumeration as a normal product read path

This is no longer an isolated consumer mistake. It is evidence that the public
API, README, and surrounding docs do not teach the intended read discipline
strongly enough.

The substrate has improved materially:

- `WarpRuntime` now clearly names the mutable runtime host
- `Worldline` exists as a first-class history handle
- observers are pinned, immutable read handles
- public snapshots are detached and hardened
- read-side retargeting was removed as a public behavior

But the public product surface still needs a deliberate design pass so the
correct path is easier to discover than the wrong one.

## IBM Design Thinking Framing

### Sponsor Human

An application developer building a real product on top of `git-warp`.

This person needs to:

- discover the right read APIs quickly
- understand cost and boundary implications
- avoid accidentally rebuilding a second graph engine in app code
- trust the README as an honest guide to production usage

### Sponsor Agent

A coding agent integrating `git-warp` into an application without rebuilding
graph logic above it.

This agent needs to:

- infer which APIs are inspection/debug surfaces versus production read paths
- compose read questions without preloading whole visible state
- avoid calling low-level materialization or enumeration APIs as the default
- learn the doctrine from examples and type/documentation affordances

### Sponsor Tooling

A debugger or tooling author building on substrate truth rather than just
application ergonomics.

This sponsor needs to:

- coordinate many lanes without inventing fake global time
- inspect immutable coordinate snapshots, receipts, and provenance honestly
- compare speculative and canonical lanes without reverse-engineering internals
- rely on public substrate APIs instead of private runtime knowledge

If the public surface serves one sponsor while confusing the others, the cycle
has failed.

## Hills

### Hill 1

As a human application developer, I can read the README and quickly understand
how to build product read paths without enumerating the whole graph or
materializing more history than I need.

### Hill 2

As a coding agent, I can identify the right `git-warp` read surfaces from the
public API and docs, and I do not infer that I should rebuild traversal or
query logic in application code.

### Hill 3

As a maintainer or tooling author, I can point to a clear doctrine that
separates:

- inspection/debug APIs
- product hot-path read APIs
- write/speculation APIs
- multi-lane playback/control APIs

so consumers stop learning the wrong cost model by accident.

## Playback Questions

- Does the README teach read discipline before raw graph power?
- Can a new consumer discover when whole-state enumeration is inappropriate?
- Are inspection APIs clearly separated from product read APIs?
- Do examples show question-shaped reads instead of app-local corpus preload?
- Can TTD-style tooling find `PlaybackHead`-class coordination and provenance
  APIs without those APIs being confused for normal app reads?
- Do both human readers and coding agents receive the same intended mental
  model from the public surface?

## Non-goals

- no decorative README rewrite without product-surface changes where needed
- no giant substrate rewrite for aesthetics alone
- no new abstraction layer that hides WARP semantics behind vague helpers
- no application-specific helper set for one consumer at the expense of the
  general substrate
- no drift toward "GraphQL server" or "ORM" mental models

## Working Doctrine To Validate

The public surface should teach these rules plainly:

- application code defines edge vocabulary and presentation semantics
- application code does not own graph materialization strategy
- application code does not own generic traversal strategy if `git-warp`
  already can answer the read question
- application code should reach first for product nouns such as `Worldline`,
  `Lens`, `Observer`, speculative lanes, and braid
- whole-graph enumeration is for inspection, debugging, migration, and bounded
  tooling, not normal product hot paths
- multi-lane stepping and playback coordination belong to a tooling/core
  stratum, not to the first-use app story
- higher layers should ask `git-warp` read questions, not reconstruct the graph
  in memory first

## Intended Outputs

This cycle should produce, at minimum:

1. a doctrine note describing the intended public read model
2. a public API stratification note describing which primitives should feel
   primary versus advanced
3. a README rewrite that teaches the right path first
4. explicit cost-signaling guidance for inspection APIs
5. task-shaped examples for both human developers and coding agents
6. tests-as-spec for the most important doc and API affordance constraints

## Candidate Questions For Design Exploration

- Should inspection APIs be grouped or labeled more explicitly?
- Should some examples move out of the Quick Start and into a lower-level
  inspection section?
- What is the smallest public read helper surface that prevents app-local graph
  rebuilding without becoming application-specific?
- Which nouns are strong enough to survive future cross-host alignment with
  Echo and Wesley-generated shared contracts?
- Should stepped multi-lane playback be surfaced as a first-class core noun
  such as `PlaybackHead`, and if so where should it live in the public API?
- How should documentation distinguish:
  - `Worldline`
  - `Observer`
  - immutable snapshot reads
  - speculative write flows
  - multi-lane playback/control
- What wording best communicates cost to both humans and agents?

## Exit Criteria

This cycle is ready to move into tests-as-spec once:

- the intended public read doctrine is written clearly enough to audit
- sponsor human and sponsor agent playback both make sense
- the README teaching order is intentionally designed rather than incidental
- at least one concrete doc/API affordance change is specific enough to test
