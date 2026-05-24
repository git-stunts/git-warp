import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

import V17GoldenGraphFixtureManifest from '../../../../src/domain/migrations/V17GoldenGraphFixtureManifest.ts';
import { parseV17GoldenGraphFixtureManifestJson }
  from '../../../../src/infrastructure/adapters/V17GoldenGraphFixtureManifestJsonAdapter.ts';

const execFileAsync = promisify(execFile);

export type V17GoldenGraphFixtureRestoreOptions = {
  readonly manifestPath: string;
  readonly targetDirectory: string;
};

export type V17GoldenGraphFixtureRestoredRef = {
  readonly refName: string;
  readonly head: string;
  readonly patchCount: number;
};

export type V17GoldenGraphFixtureRestoreResult = {
  readonly repositoryPath: string;
  readonly manifest: V17GoldenGraphFixtureManifest;
  readonly restoredRefs: readonly V17GoldenGraphFixtureRestoredRef[];
};

/** Restores and validates a v17 golden graph-history fixture into an explicit repository. */
export async function restoreV17GoldenGraphFixture(
  options: V17GoldenGraphFixtureRestoreOptions,
): Promise<V17GoldenGraphFixtureRestoreResult> {
  const manifest = await readManifest(options.manifestPath);
  const repositoryPath = resolve(options.targetDirectory);
  const bundlePath = resolve(dirname(options.manifestPath), manifest.bundlePath);

  await mkdir(repositoryPath, { recursive: true });
  await runGit(repositoryPath, ['init', '-q']);
  for (const chain of manifest.writerChains) {
    await runGit(repositoryPath, ['fetch', '-q', bundlePath, `${chain.refName}:${chain.refName}`]);
  }

  const restoredRefs = await verifyRestoredRefs(repositoryPath, manifest);
  return Object.freeze({
    repositoryPath,
    manifest,
    restoredRefs,
  });
}

async function readManifest(path: string): Promise<V17GoldenGraphFixtureManifest> {
  const raw = await readFile(path, 'utf8');
  return parseV17GoldenGraphFixtureManifestJson(raw);
}

async function verifyRestoredRefs(
  repositoryPath: string,
  manifest: V17GoldenGraphFixtureManifest,
): Promise<readonly V17GoldenGraphFixtureRestoredRef[]> {
  const restoredRefs: V17GoldenGraphFixtureRestoredRef[] = [];
  for (const chain of manifest.writerChains) {
    const head = await gitText(repositoryPath, ['rev-parse', '--verify', chain.refName]);
    if (head !== chain.expectedHead) {
      throw new Error(
        `Restored ref ${chain.refName} expected ${chain.expectedHead}, got ${head}`,
      );
    }
    const patchCountText = await gitText(repositoryPath, ['rev-list', '--count', chain.refName]);
    const patchCount = Number(patchCountText);
    if (patchCount !== chain.patchCount) {
      throw new Error(
        `Restored ref ${chain.refName} expected ${chain.patchCount} patches, got ${patchCount}`,
      );
    }
    restoredRefs.push(Object.freeze({
      refName: chain.refName,
      head,
      patchCount,
    }));
  }
  return Object.freeze(restoredRefs);
}

async function gitText(cwd: string, args: readonly string[]): Promise<string> {
  const result = await runGit(cwd, args);
  return result.stdout.trim();
}

async function runGit(
  cwd: string,
  args: readonly string[],
): Promise<{ readonly stdout: string; readonly stderr: string }> {
  return await execFileAsync('git', args, { cwd });
}
