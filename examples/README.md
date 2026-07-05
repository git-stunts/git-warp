# Deprecated v18 Compatibility Examples

Runnable snippets for the deprecated v18 graph-first compatibility surface.
Each file pairs with a topic page under [`docs/topics/`](../docs/topics/).
Do not copy these examples into new application code.

| Example | Shows | Topic |
| --- | --- | --- |
| [`optics.ts`](optics.ts) | A bounded coordinate read through an optic | [Optic reads](../docs/topics/optic-reads.md) |
| [`observers.ts`](observers.ts) | Bounding visibility with an aperture | [Observers](../docs/topics/observers.md) |
| [`bounded-reads.ts`](bounded-reads.ts) | `comparison.diff()` and `materializeSlice()` | [Optic reads](../docs/topics/optic-reads.md) |

Each example exports an `async` function that takes the `cwd` of a Git
repository. They use the deprecated migration-only
`@git-stunts/git-warp/legacy` surface with a `@git-stunts/plumbing`-backed
`GitGraphAdapter`, so run them against a real repo only for migration testing.
The Lamport ceilings in `bounded-reads.ts` are placeholders — substitute values
from your own history.
