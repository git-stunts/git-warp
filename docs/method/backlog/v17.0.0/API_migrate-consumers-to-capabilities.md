# Migrate internal consumers from WarpRuntime to capabilities

Every internal file that imports `WarpRuntime` and calls methods on it
needs to accept capability interfaces instead. This is where the tight
coupling breaks.

Key consumers:
- `Worldline.ts` — uses query + materialize capabilities
- `LogicalTraversal.js` — uses query capability
- `QueryBuilder.js` — uses query capability
- `ComparisonSelector.ts` — uses materialize + sync capabilities
- CLI commands — use various capabilities
- Test helpers — `warpGraphTestUtils.js`

Each consumer should accept the narrowest capability it needs, not the
full WarpGraph. This is the hexagonal architecture payoff.
