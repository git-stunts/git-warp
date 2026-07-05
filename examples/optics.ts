/**
 * Bounded coordinate reads through an optic.
 *
 * Pairs with docs/topics/optic-reads.md. Illustrative: run against a real
 * @git-stunts/plumbing-backed Git repository.
 */
import {
  GitGraphAdapter,
  openWarpWorldline,
  type PropValue,
} from '@git-stunts/git-warp/legacy';
import GitPlumbing from '@git-stunts/plumbing';

type PublicNodePropertyRead = {
  readonly nodeId: string;
  readonly key: string;
  readonly exists: boolean;
  readonly value: PropValue | undefined;
};

export async function readRoleThroughOptic(cwd: string): Promise<PublicNodePropertyRead> {
  const plumbing = new GitPlumbing({ cwd });
  const persistence = new GitGraphAdapter({ plumbing });

  const events = await openWarpWorldline({
    persistence,
    worldlineName: 'events',
    writerId: 'agent-1',
  });

  await events.commit((patch) => {
    patch.addNode('user:alice').setProperty('user:alice', 'role', 'admin');
  });

  // Verify a bounded basis exists, then read through a captured coordinate.
  // prepareOpticBasis() fails closed with E_OPTIC_NO_BOUNDED_BASIS rather than
  // materializing the whole graph.
  await events.prepareOpticBasis();
  const coordinate = await events.coordinate();

  // => { nodeId: 'user:alice', key: 'role', exists: true, value: 'admin', readIdentity: ... }
  return await coordinate.optic().node('user:alice').prop('role').read();
}
