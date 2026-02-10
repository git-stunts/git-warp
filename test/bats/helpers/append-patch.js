/**
 * Appends a small patch to the demo graph to advance the frontier.
 *
 * Used by BATS time-travel tests to verify seek diffs are suppressed when
 * the frontier changes between cursor snapshots.
 *
 * Expects:
 *  - REPO_PATH env var
 *  - PROJECT_ROOT env var (set by setup.bash)
 */

import { WarpGraph, persistence, crypto } from './seed-setup.js';

const graph = await WarpGraph.open({
  persistence,
  graphName: 'demo',
  writerId: 'alice',
  crypto,
});

const patch = await graph.createPatch();
await patch
  .setProperty('user:alice', 'role', 'ops')
  .commit();

