/**
 * Bounded reads that never fold the whole graph: a coordinate delta and a
 * single-entity causal-cone slice.
 *
 * Pairs with docs/topics/optic-reads.md. These use the advanced
 * openWarpGraph() surface; materializeSlice() is a diagnostic read path.
 * Illustrative: run against a real @git-stunts/plumbing-backed Git repository.
 */
import { GitGraphAdapter, openWarpGraph } from '@git-stunts/git-warp/legacy';
import GitPlumbing from '@git-stunts/plumbing';

export async function boundedReads(cwd: string): Promise<void> {
  const plumbing = new GitPlumbing({ cwd });
  const persistence = new GitGraphAdapter({ plumbing });

  const graph = await openWarpGraph({
    persistence,
    graphName: 'events',
    writerId: 'agent-1',
  });

  // What changed between two live Lamport ceilings — a frozen GraphDiff,
  // not a query().match('*') wildcard scan.
  const diff = await graph.comparison.diff({
    from: 120,
    to: 135,
    targetId: 'user:alice',
  });
  void diff.nodes.added;
  void diff.nodeProperties.changed;

  // One entity's backward causal cone, replayed on its own. Loads only the
  // cone's patches — never the whole graph.
  const slice = await graph.provenance.materializeSlice('user:alice');
  void slice.state;
  void slice.patchCount;
}
