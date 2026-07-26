# v18-to-v19 Retained-Substrate Migration

This directory owns every v18 retained-substrate reader and translator needed
by the one-shot v19 migration. Production runtime code only recognizes the
exact v19 marker and fails closed for non-empty unmarked timelines.

The migration has four boundaries:

1. Inventory every graph ref and every writer commit without writing.
2. Recreate the graph in a disposable repository, translating legacy patch
   trailers and raw content OIDs into explicit git-cas asset handles.
3. Build a current checkpoint, prove a public v19 read, and prove a disposable
   v19 append.
4. Recheck source heads and atomically promote all verified refs while retaining
   old refs and state-cache payload roots below additive recovery refs.

The default command stops after boundary 3. `--apply` explicitly enables
boundary 4.

The golden fixture under `fixtures/v18/retained-substrate-golden/` was produced
with the published `@git-stunts/git-warp@18.2.1` dependency lock. It contains
no live user or Think data.
