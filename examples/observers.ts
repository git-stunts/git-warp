/**
 * Bounding visibility with an observer + aperture.
 *
 * Pairs with docs/topics/observers.md. Illustrative: run against a real
 * @git-stunts/plumbing-backed Git repository.
 */
import {
  GitGraphAdapter,
  openWarpWorldline,
  type SnapshotPropValue,
} from '@git-stunts/git-warp';
import GitPlumbing from '@git-stunts/plumbing';

type PublicNodeProps = Readonly<{ [key: string]: SnapshotPropValue }>;

export async function readThroughPublicAperture(
  cwd: string,
): Promise<PublicNodeProps | null> {
  const plumbing = new GitPlumbing({ cwd });
  const persistence = new GitGraphAdapter({ plumbing });

  const events = await openWarpWorldline({
    persistence,
    worldlineName: 'events',
    writerId: 'agent-1',
  });

  await events.commit((patch) => {
    patch
      .addNode('task:auth')
      .setProperty('task:auth', 'status', 'open')
      .setProperty('task:auth', 'internalNotes', 'do not leak');
  });

  // The aperture selects which entities are in view and redacts sensitive props.
  const publicView = await events.observer('public-review', {
    match: ['task:*', 'service:*'],
    redact: ['internalNotes'],
  });

  // => { status: 'open' }  (internalNotes is redacted)
  return await publicView.getNodeProps('task:auth');
}
