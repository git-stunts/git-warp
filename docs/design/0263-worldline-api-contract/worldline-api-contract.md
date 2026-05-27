# Worldline API Naming And Dependency Contract

## Hill

Freeze the public naming, dependency object, and first implementation contract
for the Worldline/Optic-first API before writing TypeScript. Slice 115 is done
when code slices can implement one agreed surface without renegotiating names.

## Inputs

- PRD: [0261-worldline-optic-public-api-deprecation-prd](../0261-worldline-optic-public-api-deprecation-prd/worldline-optic-public-api-deprecation-prd.md)
- Inventory: [0262-public-surface-inventory](../0262-public-surface-inventory/public-surface-inventory.md)
- Current root exports: `index.ts`
- Current advanced composition root: `src/domain/WarpGraph.ts`
- Current product facade: `src/domain/WarpApp.ts`
- Current substrate facade: `src/domain/WarpCore.ts`
- Current read handles: `src/domain/services/Worldline.ts` and
  `src/domain/services/query/Observer.ts`

## Decision Summary

| Decision | Choice |
|----------|--------|
| Preferred entrypoint | `openWarpWorldline()` |
| Returned runtime-backed handle | `WarpWorldline` |
| Open options type | `WarpWorldlineOpenOptions` |
| Patch callback type | `WarpWorldlinePatchBuild` |
| Implementation substrate | `openWarpGraph()` |
| Root default export | Leave as `WarpApp` during this branch. |
| Legacy deprecation timing | Do not mark old APIs deprecated until the new entrypoint and tests exist. |
| Optic export posture | Export the bounded optic result family at the root when the new handle exposes optics in docs. |

## Public API Contract

The new first-use path is a named root export:

```text
import { openWarpWorldline } from '@git-stunts/git-warp';

const worldline = await openWarpWorldline({
  persistence,
  worldlineName: 'events',
  writerId: 'agent-1',
  trust: { mode: 'enforce' },
});

await worldline.commit((patch) => {
  patch.addNode('user:alice');
  patch.setNodeProp('user:alice', 'displayName', 'Alice');
});

const live = worldline.live();
const props = await live.getNodeProps('user:alice');
const publicUsers = await live.observer('public-users', { match: 'user:*' });
```

The contract is intentionally smaller than `WarpApp`, `WarpCore`, or
`openWarpGraph()`:

| Member | Required behavior |
|--------|-------------------|
| `worldlineName` | Public identity string supplied by `WarpWorldlineOpenOptions.worldlineName`. |
| `writerId` | Public writer identity string supplied by `WarpWorldlineOpenOptions.writerId`. |
| `commit(build)` | Commits one causal patch through the underlying patch capability and returns the committed SHA. |
| `live()` | Returns the current live `Worldline` read handle. |
| `seek(options?)` | Returns a `Promise<Worldline>` for the requested worldline source. |
| `observer(config)` | Creates a live observer by delegating to `live().observer(config)`. |
| `observer(name, config)` | Creates a named live observer by delegating to `live().observer(name, config)`. |
| `optic()` | Delegates to `live().optic()` and preserves the current bounded checkpoint-tail limits. |

The handle must not expose:

- `graphName`
- `core()`
- `materialize()`
- `materializeCoordinate()`
- `materializeAt()`
- `materializeSlice()`
- `materializeStrand()`
- `checkpoint`
- `provenance`
- `strands`
- graph-wide moment surfaces such as `commitment`, `folding`, `revelation`, or
  `governance`

## Dependency Contract

`WarpWorldlineOpenOptions` maps to `WarpGraphDeps`, but uses worldline language
at the public boundary.

| Public field | Required | Maps to | Notes |
|--------------|----------|---------|-------|
| `persistence` | Yes | `WarpGraphDeps.persistence` | Existing core persistence port. |
| `worldlineName` | Yes | `WarpGraphDeps.graphName` | The storage ref layout still uses graph refs internally. The new API must not expose that as the first-use noun. |
| `writerId` | Yes | `WarpGraphDeps.writerId` | Existing writer identity. |
| `trust` | No | `WarpGraphDeps.trust` | Preserve current trust behavior. |
| `gcPolicy` | No | `WarpGraphDeps.gcPolicy` | Advanced option, forwarded unchanged. |
| `checkpointPolicy` | No | `WarpGraphDeps.checkpointPolicy` | Advanced option, forwarded unchanged. |
| `onDeleteWithData` | No | `WarpGraphDeps.onDeleteWithData` | Preserve current patch validation behavior. |
| `autoMaterialize` | No | `WarpGraphDeps.autoMaterialize` | Compatibility forwarding only; docs should not teach it as part of the new read model. |
| `crypto` | No | `WarpGraphDeps.crypto` | Forward unchanged. |
| `codec` | No | `WarpGraphDeps.codec` | Forward unchanged. |
| `audit` | No | `WarpGraphDeps.audit` | Forward unchanged. |
| `logger` | No | `WarpGraphDeps.logger` | Forward unchanged. |
| `effectPipeline` | No | `WarpGraphDeps.effectPipeline` | Forward unchanged. |
| `effectSinks` | No | `WarpGraphDeps.effectSinks` | Forward unchanged. |
| `externalizationPolicy` | No | `WarpGraphDeps.externalizationPolicy` | Forward unchanged. |
| `seekCache` | No | `WarpGraphDeps.seekCache` | Forward unchanged. |
| `blobStorage` | No | `WarpGraphDeps.blobStorage` | Forward unchanged. |
| `patchBlobStorage` | No | `WarpGraphDeps.patchBlobStorage` | Forward unchanged. |
| `patchJournal` | No | `WarpGraphDeps.patchJournal` | Forward unchanged. |
| `checkpointStore` | No | `WarpGraphDeps.checkpointStore` | Forward unchanged. |
| `indexStore` | No | `WarpGraphDeps.indexStore` | Forward unchanged. |
| `adjacencyCacheSize` | No | `WarpGraphDeps.adjacencyCacheSize` | Forward unchanged. |

Rejected public fields:

| Rejected field | Reason |
|----------------|--------|
| `graphName` | It keeps the old graph-opening noun in the new first-use API. |
| `core` | It recreates the `WarpApp.core()` escape hatch. |
| `materialize` | It contradicts the product pivot. |
| `sync` | It is real, but not needed for the minimal first-use worldline handle. Add later only with a worldline-oriented transport story. |

## Naming Decisions

### Entrypoint

Chosen: `openWarpWorldline()`

Why:

- Starts with the repo/product prefix already used by `openWarpGraph()`.
- Names the product noun the user is opening.
- Avoids generic `openWorldline()`, which is too broad in downstream code.
- Avoids `openWarp()`, which says nothing about the read/write boundary.

Rejected:

| Name | Rejection reason |
|------|------------------|
| `openWorldline()` | Too generic once imported beside Echo, Continuum, or app-local worldline nouns. |
| `openWarp()` | Too vague; does not teach the user what they get. |
| `openWarpSession()` | Suggests lifecycle/session semantics the current runtime does not model. |
| `openWarpWorkspace()` | Sounds like a tool shell instead of a causal history boundary. |
| `openWarpGraphWorldline()` | Reintroduces the graph noun into the new public path. |

### Handle

Chosen: `WarpWorldline`

Why:

- Mirrors `WarpApp`, `WarpCore`, and `Worldline` naming without adding a vague
  "manager" or "client" suffix.
- Names a runtime-backed public concept, not a structural shape.
- Keeps `Worldline` available as the existing read-basis handle returned by
  `live()` and `seek()`.

Rejected:

| Name | Rejection reason |
|------|------------------|
| `WarpWorldlineHandle` | More explicit, but the repo generally uses named runtime concepts rather than `Handle` suffixes for public classes. |
| `WorldlineWorkspace` | Workspace suggests local UI/tooling scope rather than causal history. |
| `WarpWorkspace` | Too broad and hides the worldline pivot. |
| `WarpSession` | Implies lifecycle and close semantics that are not present. |

### Open Options

Chosen: `WarpWorldlineOpenOptions`

Why:

- Follows the existing `WarpCoreOpenOptions` naming pattern.
- Makes the options type easy to find beside the entrypoint and handle.
- Lets docs say "open options" without using graph language.

Rejected:

| Name | Rejection reason |
|------|------------------|
| `WarpWorldlineDeps` | Too implementation-shaped for public docs. |
| `WorldlineDeps` | Too generic and likely to collide with app/Echo concepts. |
| `WarpWorldlineConfig` | Vague; not all fields are configuration. |

## Implementation Placement

Add the new type and entrypoint in a dedicated domain file:

```text
src/domain/WarpWorldline.ts
```

Then export from `index.ts`.

Reasoning:

- `src/domain/WarpGraph.ts` should remain the advanced graph capability bag.
- `src/domain/WarpApp.ts` should remain the legacy app facade.
- `src/domain/WarpCore.ts` should remain substrate/tooling compatibility.
- A dedicated file keeps the new concept visible and avoids turning
  `WarpGraph.ts` into another multi-concept corridor.

## Expected Type Shape

This is a contract sketch, not code for copy/paste:

```text
type WarpWorldlinePatchBuild = (patch: PatchBuilder) => void | Promise<void>;

type WarpWorldlineOpenOptions = {
  readonly persistence: CorePersistence;
  readonly worldlineName: string;
  readonly writerId: string;
  readonly trust?: TrustOptions;
  readonly ...advancedForwardedOptions;
};

class WarpWorldline {
  readonly worldlineName: string;
  readonly writerId: string;

  commit(build: WarpWorldlinePatchBuild): Promise<string>;
  live(): Worldline;
  seek(options?: WorldlineOptions): Promise<Worldline>;
  observer(config: Aperture): Promise<Observer>;
  observer(name: string, config: Aperture): Promise<Observer>;
  optic(): WorldlineOptic;
}
```

Implementation constraints:

- `WarpWorldline` should hold only the minimal private graph capability bag
  needed for commit and read delegation.
- Constructor or factory must freeze the public object, matching current frozen
  capability posture.
- `worldlineName` maps internally to `graphName`, but the public class should
  not expose `graphName`.
- `commit()` should call the existing patch capability rather than duplicating
  patch/session logic.
- `live()` should call or cache `graph.query.worldline()` only if caching cannot
  create stale source semantics.
- `seek()` should use the existing `Worldline`/`WorldlineOptions` path.
- `optic()` should preserve current `Worldline.optic()` failure modes.

## Root Export Plan

Slice 116/117 should add:

- `openWarpWorldline`
- `WarpWorldline`
- `WarpWorldlineOpenOptions`
- `WarpWorldlinePatchBuild`

Slice 119 or 122 should add the bounded optic family if type-surface evidence
shows consumers otherwise need private-path imports:

- `WorldlineOptic`
- `NodeOptic`
- `NodePropertyOptic`
- `NodeOpticReadResult`
- `NodePropertyOpticReadResult`
- `ReadIdentity`

Do not root-export checkpoint-tail implementation classes:

- `CheckpointTailOpticSource`
- `CheckpointTailWitnessLocator`
- `CheckpointTailBasisLoader`
- `CheckpointShardFactReader`
- `CheckpointTailFactReducer`

Those are substrate mechanics, not public product nouns.

## Test Contract For Implementation Slices

Slice 116 should be considered incomplete unless type checks prove:

- `openWarpWorldline` is not exported yet if slice 116 only adds types, or it is
  exported with a failing/placeholder-free implementation if slice boundaries
  shift.
- `WarpWorldlineOpenOptions` requires `worldlineName`, not `graphName`.
- `WarpWorldline` does not expose `materialize`, `checkpoint`, `provenance`,
  `strands`, or `core`.

Slice 117 should be considered incomplete unless tests prove:

- `openWarpWorldline()` returns a frozen `WarpWorldline`.
- `worldline.worldlineName` and `worldline.writerId` are stable.
- Invalid open options fail before returning a handle.
- The underlying `openWarpGraph()` compatibility tests still pass.

Slice 118 should be considered incomplete unless tests prove:

- `commit()` writes a patch visible from `live()`.
- A thrown patch callback does not commit partial state.
- Existing writer conflict behavior is preserved.

## Slice 115 Acceptance

- Entrypoint, handle, options, and callback names are chosen.
- Public options map cleanly to current `WarpGraphDeps` without exposing
  `graphName`.
- The implementation file boundary is chosen.
- Root export posture is explicit.
- Optic export posture is explicit enough for slice 119/122.
