import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import {
  parseV18RetainedStateCacheJson,
  parseV18RetainedSubstrateFixtureManifestJson,
  type V18RetainedSubstrateFixtureManifest,
} from './adapters/V18RetainedSubstrateFixtureJsonAdapter.ts';

const execFileAsync = promisify(execFile);

export type V18RetainedSubstrateRestoredRef = Readonly<{
  head: string;
  objectType: string;
  refName: string;
}>;

export type V18RetainedSubstrateFixtureRestoreResult = Readonly<{
  manifest: V18RetainedSubstrateFixtureManifest;
  repositoryPath: string;
  restoredRefs: readonly V18RetainedSubstrateRestoredRef[];
}>;

export async function restoreV18RetainedSubstrateFixture(options: Readonly<{
  manifestPath: string;
  targetDirectory: string;
}>): Promise<V18RetainedSubstrateFixtureRestoreResult> {
  const manifestPath = requirePath(options.manifestPath, 'manifestPath');
  const repositoryPath = resolve(requirePath(
    options.targetDirectory,
    'targetDirectory',
  ));
  const manifest = parseV18RetainedSubstrateFixtureManifestJson(
    await readFile(manifestPath, 'utf8'),
  );
  const bundlePath = resolve(dirname(manifestPath), manifest.bundlePath);
  await verifyBundleDigest(bundlePath, manifest.bundleSha256);
  await mkdir(repositoryPath, { recursive: true });
  await runGit(repositoryPath, ['init', '-q']);
  for (const ref of manifest.refs) {
    await runGit(repositoryPath, [
      'fetch',
      '-q',
      bundlePath,
      `${ref.refName}:${ref.refName}`,
    ]);
  }
  const restoredRefs = await verifyRefs(repositoryPath, manifest);
  await verifyRetainedState(repositoryPath, manifest);
  return Object.freeze({ manifest, repositoryPath, restoredRefs });
}

async function verifyBundleDigest(
  bundlePath: string,
  expectedDigest: string,
): Promise<void> {
  const digest = createHash('sha256')
    .update(await readFile(bundlePath))
    .digest('hex');
  if (digest !== expectedDigest) {
    throw new Error(`v18 fixture bundle digest mismatch: ${digest}`);
  }
}

async function verifyRefs(
  repositoryPath: string,
  manifest: V18RetainedSubstrateFixtureManifest,
): Promise<readonly V18RetainedSubstrateRestoredRef[]> {
  const restored: V18RetainedSubstrateRestoredRef[] = [];
  for (const ref of manifest.refs) {
    const head = await gitText(repositoryPath, ['rev-parse', '--verify', ref.refName]);
    const objectType = await gitText(repositoryPath, ['cat-file', '-t', ref.refName]);
    if (head !== ref.expectedHead || objectType !== ref.expectedObjectType) {
      throw new Error(`v18 fixture ref mismatch: ${ref.refName}`);
    }
    if (ref.kind === 'writer') {
      const count = Number(await gitText(
        repositoryPath,
        ['rev-list', '--count', ref.refName],
      ));
      if (count !== ref.patchCount) {
        throw new Error(`v18 fixture patch count mismatch: ${ref.refName}`);
      }
    }
    restored.push(Object.freeze({ head, objectType, refName: ref.refName }));
  }
  return Object.freeze(restored);
}

async function verifyRetainedState(
  repositoryPath: string,
  manifest: V18RetainedSubstrateFixtureManifest,
): Promise<void> {
  const expected = manifest.retainedState;
  const cache = parseV18RetainedStateCacheJson(await gitText(
    repositoryPath,
    ['cat-file', 'blob', expected.refName],
  ));
  const snapshot = cache.snapshots[expected.snapshotId];
  if (
    snapshot === undefined
    || snapshot.payloadRef !== expected.payloadRoot
    || snapshot.stateHash !== expected.stateHash
  ) {
    throw new Error('v18 fixture retained snapshot mismatch');
  }
  await runGit(repositoryPath, [
    'cat-file',
    '-e',
    `${expected.payloadRoot}^{${expected.payloadRootObjectType}}`,
  ]);
}

function requirePath(value: string, name: string): string {
  if (value.trim().length === 0) {
    throw new Error(`${name} must be a non-empty path`);
  }
  return value;
}

async function gitText(cwd: string, args: readonly string[]): Promise<string> {
  return (await runGit(cwd, args)).stdout.trim();
}

async function runGit(
  cwd: string,
  args: readonly string[],
): Promise<{ readonly stderr: string; readonly stdout: string }> {
  return await execFileAsync('git', args, { cwd });
}
