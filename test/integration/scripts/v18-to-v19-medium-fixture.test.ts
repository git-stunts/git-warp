import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { restoreV18RetainedSubstrateFixture } from '../../../scripts/v18-to-v19/V18RetainedSubstrateFixtureRestore.ts';
import { readV18MigrationRef } from '../../../scripts/v18-to-v19/V18MigrationGit.ts';

const MANIFEST_PATH = resolve(
  'fixtures/v18/retained-substrate-medium/manifest.json',
);

describe('v18-to-v19 medium standalone migration', () => {
  const temporaryDirectories: string[] = [];

  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map(async (directory) => {
        await rm(directory, { recursive: true, force: true });
      }),
    );
  });

  it('proves the 2 MiB published-v18 fixture without moving source refs', async () => {
    const targetDirectory = await mkdtemp(join(tmpdir(), 'git-warp-v18-medium-'));
    temporaryDirectories.push(targetDirectory);
    const restored = await restoreV18RetainedSubstrateFixture({
      manifestPath: MANIFEST_PATH,
      targetDirectory,
    });
    const before = await readFixtureRefs(restored.repositoryPath, restored.manifest.refs);

    const execution = await runStandaloneMigration({
      graph: restored.manifest.graphId,
      repositoryPath: restored.repositoryPath,
    });
    const { report } = execution;

    expect(report).toMatchObject({
      scratchVerified: true,
      status: 'verified-dry-run',
    });
    expect(report.plan.writers).toEqual(expect.arrayContaining([
      expect.objectContaining({ commitCount: 16, writer: 'medium-alice' }),
      expect.objectContaining({ commitCount: 2, writer: 'medium-bob' }),
    ]));
    expect(execution.stderr).toMatch(/\[inventory\].*medium-alice 16\/16/u);
    expect(execution.stderr).toMatch(/\[rewrite\].*medium-alice 16\/16/u);
    expect(execution.stderr).toContain('[verify]');
    expect(await readFixtureRefs(
      restored.repositoryPath,
      restored.manifest.refs,
    )).toEqual(before);
  }, 120_000);
});

type StandaloneReport = Readonly<{
  plan: Readonly<{
    writers: readonly Readonly<{ commitCount: number; writer: string }>[];
  }>;
  scratchVerified: boolean;
  status: string;
}>;

async function runStandaloneMigration(options: Readonly<{
  graph: string;
  repositoryPath: string;
}>): Promise<Readonly<{ report: StandaloneReport; stderr: string }>> {
  const result = await runProcess(process.execPath, [
    'scripts/v18-to-v19/migrate.ts',
    '--repo',
    options.repositoryPath,
    '--graph',
    options.graph,
    '--json',
  ]);
  if (result.exitCode !== 0) {
    throw new Error(`standalone migration failed: ${result.stderr}`);
  }
  return Object.freeze({
    report: JSON.parse(result.stdout) as StandaloneReport,
    stderr: result.stderr,
  });
}

async function readFixtureRefs(
  repositoryPath: string,
  refs: readonly Readonly<{ refName: string }>[],
): Promise<Readonly<Record<string, string | null>>> {
  const values: Record<string, string | null> = {};
  for (const ref of refs) {
    values[ref.refName] = await readV18MigrationRef(repositoryPath, ref.refName);
  }
  return Object.freeze(values);
}

async function runProcess(
  command: string,
  args: readonly string[],
): Promise<Readonly<{ exitCode: number | null; stderr: string; stdout: string }>> {
  return await new Promise((complete, reject) => {
    const child = spawn(command, args, { cwd: resolve('.') });
    const stdout: Uint8Array[] = [];
    const stderr: Uint8Array[] = [];
    child.stdout.on('data', (chunk: Uint8Array) => stdout.push(chunk));
    child.stderr.on('data', (chunk: Uint8Array) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) => complete(Object.freeze({
      exitCode,
      stderr: Buffer.concat(stderr).toString('utf8'),
      stdout: Buffer.concat(stdout).toString('utf8'),
    })));
  });
}
