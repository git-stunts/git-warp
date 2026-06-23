# Examples

Runnable, illustrative snippets for the public `git-warp` read model. Each file
pairs with a topic page under [`docs/topics/`](../docs/topics/).

| Example | Shows | Topic |
| --- | --- | --- |
| [`optics.ts`](optics.ts) | A bounded coordinate read through an optic | [Optics](../docs/topics/optics.md) |
| [`observers.ts`](observers.ts) | Bounding visibility with an aperture | [Observers](../docs/topics/observers.md) |
| [`bounded-reads.ts`](bounded-reads.ts) | `comparison.diff()` and `materializeSlice()` | [Bounded Reads](../docs/topics/bounded-reads.md) |

Each example exports an `async` function that takes the `cwd` of a Git
repository. They construct a `@git-stunts/plumbing`-backed `GitGraphAdapter`, so
run them against a real repo. The Lamport ceilings in `bounded-reads.ts` are
placeholders — substitute values from your own history.
