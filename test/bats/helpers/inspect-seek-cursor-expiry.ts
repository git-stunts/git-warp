import ContentAddressableStore from '@git-stunts/git-cas';
import GitPlumbing from '@git-stunts/plumbing';

const repoPath = requiredEnvironmentVariable('REPO_PATH');
const graphName = requiredEnvironmentVariable('GRAPH_NAME');
const activeKey = JSON.stringify([1, graphName, 'active']);
const plumbing = await GitPlumbing.createDefault({ cwd: repoPath });
const cas = ContentAddressableStore.createCbor({
  plumbing,
  chunking: { strategy: 'cdc' },
  applicationRefPrefixes: ['refs/warp/'],
});

try {
  const cache = await cas.caches.open({ namespace: 'git-warp.seek-cursors' });
  const inspection = await cache.inspect({ limit: 100 });
  const active = inspection.entries.find((entry) => entry.key === activeKey);
  if (active?.expiresAt === null || active?.expiresAt === undefined) {
    throw new Error(`active seek cursor expiry is missing for graph '${graphName}'`);
  }
  process.stdout.write(active.expiresAt);
} finally {
  await cas.close();
}

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} must be set`);
  }
  return value;
}
