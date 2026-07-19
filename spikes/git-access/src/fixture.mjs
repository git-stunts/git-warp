import { Buffer } from 'node:buffer';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { executeGit } from './git-process.mjs';

const FIXED_ENV = Object.freeze({
  ...process.env,
  GIT_AUTHOR_DATE: '2000-01-01T00:00:00Z',
  GIT_AUTHOR_EMAIL: 'spike@git-warp.invalid',
  GIT_AUTHOR_NAME: 'git-warp spike',
  GIT_COMMITTER_DATE: '2000-01-01T00:00:00Z',
  GIT_COMMITTER_EMAIL: 'spike@git-warp.invalid',
  GIT_COMMITTER_NAME: 'git-warp spike',
});

export async function createFixture({ objectCount, payloadBytes, payloadProfile, fanout, packed }) {
  const temporaryPath = await mkdtemp(join(tmpdir(), 'git-warp-git-access-'));
  const gitDir = join(temporaryPath, 'fixture.git');
  await executeGit(null, ['init', '--bare', '--object-format=sha1', gitDir]);

  const blobs = [];
  for (let index = 0; index < objectCount; index += 1) {
    const content = fixturePayload(index, payloadBytes, payloadProfile);
    const oid = (
      await executeGit(gitDir, ['hash-object', '-w', '--stdin'], {
        input: content,
      })
    ).trim();
    blobs.push({
      content,
      index,
      name: `entry-${index.toString().padStart(6, '0')}.bin`,
      oid,
      size: content.length,
    });
  }

  const leaves = [];
  for (let start = 0; start < blobs.length; start += fanout) {
    const entries = blobs.slice(start, start + fanout);
    const input = entries.map((entry) => `100644 blob ${entry.oid}\t${entry.name}`).join('\n');
    const oid = (await executeGit(gitDir, ['mktree'], { input: `${input}\n` })).trim();
    const name = `shard-${leaves.length.toString().padStart(4, '0')}`;
    leaves.push(Object.freeze({ entries: Object.freeze(entries), name, oid }));
    for (const entry of entries) {
      entry.leafName = name;
      entry.leafOid = oid;
    }
  }

  const rootInput = leaves.map((leaf) => `040000 tree ${leaf.oid}\t${leaf.name}`).join('\n');
  const rootTreeOid = (
    await executeGit(gitDir, ['mktree'], {
      input: `${rootInput}\n`,
    })
  ).trim();
  const commitOid = (
    await executeGit(gitDir, ['commit-tree', rootTreeOid], {
      env: FIXED_ENV,
      input: 'git access spike fixture\n',
    })
  ).trim();
  const refName = 'refs/heads/main';
  await executeGit(gitDir, ['update-ref', refName, commitOid]);
  await executeGit(gitDir, ['symbolic-ref', 'HEAD', refName]);

  if (packed) {
    await executeGit(gitDir, ['repack', '-ad']);
    await executeGit(gitDir, ['prune-packed']);
  }

  return Object.freeze({
    blobs: Object.freeze(blobs.map((entry) => Object.freeze(entry))),
    cleanup: async () => await rm(temporaryPath, { recursive: true, force: true }),
    commitOid,
    fanout,
    gitDir,
    leaves: Object.freeze(leaves),
    objectFormat: 'sha1',
    oidBytes: 20,
    packed,
    payloadBytes,
    payloadProfile,
    refName,
    rootTreeOid,
  });
}

export function fixturePayload(index, byteLength, profile = 'repetitive') {
  const prefix = Buffer.from(`${index.toString(16).padStart(12, '0')}:`, 'ascii');
  if (prefix.length > byteLength) {
    throw new Error('Fixture payload is smaller than its deterministic prefix');
  }
  const content =
    profile === 'random'
      ? deterministicRandomBytes(index, byteLength)
      : Buffer.alloc(byteLength, 97 + (index % 26));
  prefix.copy(content);
  return content;
}

function deterministicRandomBytes(seed, byteLength) {
  const content = Buffer.allocUnsafe(byteLength);
  let state = ((seed + 1) * 0x9e3779b1) >>> 0;
  for (let offset = 0; offset < byteLength; offset += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    content[offset] = state & 0xff;
  }
  return content;
}
