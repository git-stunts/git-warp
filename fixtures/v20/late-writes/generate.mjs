// Generates the v20.0.0 late-writes fixture for the v20-to-v21 migration
// boundary (#1015).
//
// Usage: node fixtures/v20/late-writes/generate.mjs <v20.0.0-worktree> <empty-target>
//
// A real v20.0.0 RuntimeHost is opened before the migration runs and keeps
// writing afterwards, to a lane and to a strand. v20.0.0 caches its
// substrate check, so nothing can stop it; the migration contains those
// writes instead. A fresh v20.0.0 open after migration must be refused.
// The worktree must be a built checkout of the v20.0.0 tag; the migration
// is the current source tree's.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const RELEASE_COMMIT = 'ceb58e656ec5bc85f0ae5991bf2a55599693bbb3';
const GRAPH = 'late';

for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_PREFIX']) {
  delete process.env[name];
}
for (const role of ['AUTHOR', 'COMMITTER']) {
  process.env[`GIT_${role}_NAME`] = 'Git Warp Fixture';
  process.env[`GIT_${role}_EMAIL`] = 'fixture@git-warp.local';
  process.env[`GIT_${role}_DATE`] = '2026-01-01T00:00:00Z';
}

const git = (cwd, args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' }).trim();
const [releaseArg, targetArg] = process.argv.slice(2);
if (releaseArg === undefined || targetArg === undefined) {
  throw new Error('usage: node generate.mjs <v20.0.0-worktree> <empty-target>');
}
const release = resolve(releaseArg);
const target = resolve(targetArg);
if (git(release, ['rev-parse', 'HEAD']) !== RELEASE_COMMIT) {
  throw new Error(`${release} is not the v20.0.0 release commit ${RELEASE_COMMIT}`);
}
mkdirSync(target, { recursive: true });
if (readdirSync(target).length > 0) { throw new Error(`${target} must be empty`); }
git(target, ['init', '-q', '--initial-branch=fixture']);

const dist = (path) => import(pathToFileURL(join(release, 'dist', path)).href);
const { default: GitStorage } = await dist('src/application/GitStorage.js');
const { resolveWarpStorage } = await dist('src/application/WarpStorageRegistry.js');
const { getDefaultRuntimeHostNodePorts } = await dist('src/application/RuntimeHostNodeDefaults.js');
const { openRuntimeHostProduct } = await dist('src/domain/warp/RuntimeHostProduct.js');
const { default: V21MigrationSession } = await import(
  pathToFileURL(resolve('scripts/v20-to-v21/V21MigrationSession.ts')).href
);

/** Opens a v20.0.0 RuntimeHost and returns it with its storage, still open. */
async function openV20(writerId) {
  const storage = await GitStorage.open({ cwd: target });
  const binding = resolveWarpStorage(storage);
  const ports = getDefaultRuntimeHostNodePorts();
  const host = await openRuntimeHostProduct({
    persistence: binding.history, runtimeStorage: binding.runtimeStorage, graphName: GRAPH, writerId,
    codec: ports.codec, crypto: ports.crypto, trustCrypto: ports.trustCrypto, commitMessageCodec: ports.commitMessageCodec,
  });
  return { host, storage };
}

// v20.0.0 history: alice writes the lane and a strand.
const setup = await openV20('alice');
await setup.host.patch((patch) => { patch.addNode('lane:1'); });
await setup.host.createStrand({ strandId: 'side', owner: 'alice' });
await setup.host.patchStrand('side', (patch) => { patch.addNode('side:1'); });
await setup.storage.close();

// A v20.0.0 process opened before the migration, still running.
const running = await openV20('alice');
await running.host.materialize();

const session = await V21MigrationSession.open(target);
const migration = await session.migrate(GRAPH, new Map());
await session.close();
if (migration.status !== 'migrated') { throw new Error(`migration ${migration.status}`); }

// The running v20.0.0 process writes after the migration.
const lateLane = await running.host.patch((patch) => { patch.addNode('late:lane'); });
await running.host.patchStrand('side', (patch) => { patch.addNode('late:strand'); });
await running.storage.close();

// A fresh v20.0.0 open after the migration.
let freshOpen;
try {
  const fresh = await openV20('carol');
  await fresh.storage.close();
  freshOpen = { refused: false, code: null };
} catch (error) {
  freshOpen = { refused: true, code: error.code ?? null };
}

process.stdout.write(`${JSON.stringify({ lateLane, freshOpen }, null, 2)}\n`);
