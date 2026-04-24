---
title: "Remove direct WarpRuntime typing from WarpCore"
cycle: "0064-warpcore-runtime-bridge"
---

# Remove Direct WarpRuntime Typing From WarpCore

## Sponsor human

James Ross

## Sponsor agent

Codex

## Why this exists

`WarpCore.ts` is the last obvious public facade file that still names
`WarpRuntime` directly.

The remaining lies in the file are:

- it imports `WarpRuntime` for both `open()` and public method typing
- it calls `WarpRuntime.prototype.*` directly for strand and comparison methods
- it still carries `Record<string, unknown>` option bags for strand patch lists

That makes `WarpCore` read like a runtime subclass even though the real seam is
now “public facade over a runtime bridge.”

## Hill

`WarpCore.ts` no longer imports `WarpRuntime` directly, no longer calls
`WarpRuntime.prototype.*`, and uses an explicit runtime-bridge module plus
named strand patch option types instead.

## Playback questions

### Agent

- Does `WarpCore.ts` stop importing `WarpRuntime`?
- Does `WarpCore.ts` stop calling `WarpRuntime.prototype.*` directly?
- Does `WarpCore.ts` stop using `Record<string, unknown>` for strand patch
  options?

### Human

- Can I read `WarpCore.ts` and understand that it is a public facade over an
  explicit bridge, not a secret runtime subclass?
- Is the remaining capability-migration tail now clearly the
  `openWarpGraph()` / `WarpRuntime` composition-root residue?

## Non-goals

- No `WarpRuntime` deletion in this slice
- No `openWarpGraph()` factory rewrite in this slice
- No host-bag cleanup across controllers in this slice

## Test plan

### RED

Add a shape ratchet that fails until:

- `WarpCore.ts` no longer imports `WarpRuntime`
- `WarpCore.ts` no longer references `WarpRuntime.prototype`
- `WarpCore.ts` no longer contains `Record<string, unknown>`

### GREEN

- move the runtime-dependent types and prototype linkage into a dedicated bridge
- route `WarpCore` public methods through `callInternalRuntimeMethod(...)`
- replace strand patch list option bags with an explicit type
- graduate `WarpCore.ts` from the boundary quarantine if the touched file no
  longer violates the rule family

### Witness

- `npm exec vitest run test/unit/scripts/warpcore-runtime-bridge.test.ts test/unit/domain/WarpCore.content.test.ts test/unit/domain/WarpCore.effectPipeline.test.ts test/unit/domain/WarpCore.emit.test.ts`
- `npm run typecheck`
- `git diff --check`

## Playback

### Agent

- Yes. `WarpCore.ts` no longer imports `WarpRuntime`.
- Yes. `WarpCore.ts` no longer calls `WarpRuntime.prototype.*`.
- Yes. Strand patch list options no longer use `Record<string, unknown>`.

### Human

- Yes. `WarpCore.ts` now reads like a facade over an explicit runtime bridge
  instead of a file that secretly thinks it is `WarpRuntime`.
- Yes. The remaining capability-migration tail is now clearly the
  `openWarpGraph()` / `WarpRuntime` composition-root residue.

### Verdict

`hill met`

## Drift check

No negative drift.
