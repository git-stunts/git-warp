import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import process from 'node:process';
import { URL } from 'node:url';

import { GitGraphAdapter, openWarpWorldline } from '@git-stunts/git-warp';
import GitPlumbing from '@git-stunts/plumbing';

const repositoryPath = new URL('./repository/', import.meta.url).pathname;
const graph = 'v18-medium-retained-substrate';
const plumbing = await GitPlumbing.createDefault({ cwd: repositoryPath });
const persistence = new GitGraphAdapter({ plumbing });

process.env.GIT_AUTHOR_NAME = 'Git Warp Fixture';
process.env.GIT_AUTHOR_EMAIL = 'fixture@git-warp.local';
process.env.GIT_AUTHOR_DATE = '2026-01-01T00:00:00Z';
process.env.GIT_COMMITTER_NAME = 'Git Warp Fixture';
process.env.GIT_COMMITTER_EMAIL = 'fixture@git-warp.local';
process.env.GIT_COMMITTER_DATE = '2026-01-01T00:00:00Z';

const alice = await openWarpWorldline({
  persistence,
  worldlineName: graph,
  writerId: 'medium-alice',
});
for (let index = 0; index < 16; index += 1) {
  const nodeId = `medium:document:${String(index).padStart(3, '0')}`;
  await alice.commit(async (patch) => {
    patch.addNode(nodeId).setProperty(nodeId, 'ordinal', index);
    await patch.attachContent(nodeId, deterministicBytes(index, 128 * 1024), {
      mime: 'application/octet-stream',
    });
  });
}

const bob = await openWarpWorldline({
  persistence,
  worldlineName: graph,
  writerId: 'medium-bob',
});
for (let index = 0; index < 2; index += 1) {
  const nodeId = `medium:review:${String(index).padStart(2, '0')}`;
  await bob.commit((patch) => {
    patch.addNode(nodeId).setProperty(nodeId, 'reviewed', true);
  });
}

await alice
  .live()
  .query()
  .match('medium:document:000')
  .select(['id'])
  .run();

if (typeof plumbing.close === 'function') {
  await plumbing.close();
}

function deterministicBytes(seed, byteLength) {
  const output = Buffer.alloc(byteLength);
  let offset = 0;
  let block = 0;
  while (offset < output.length) {
    const digest = createHash('sha256')
      .update(`git-warp-v18-medium-fixture:${String(seed)}:${String(block)}`)
      .digest();
    digest.copy(output, offset);
    offset += digest.length;
    block += 1;
  }
  return output;
}
