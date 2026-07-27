import { spawn } from 'node:child_process';

import { afterEach, describe, expect, it } from 'vitest';

import V18MigrationExecutionMode from '../../../scripts/v18-to-v19/V18MigrationExecutionMode.ts';
import { parseV18MigrationCliOptions } from '../../../scripts/v18-to-v19/migrate.ts';
import { gitOk, MigrationTestDirectories } from './migrationTestEnvironment.ts';

describe('v18 migration CLI', () => {
  const directories = new MigrationTestDirectories();

  afterEach(async () => {
    await directories.cleanup();
  });

  it('promotes by default and reserves rehearsal for explicit --dry-run', () => {
    const required = ['--repo', '/tmp/repo', '--graph', 'think'];
    const normal = parseV18MigrationCliOptions(required);
    const compatibility = parseV18MigrationCliOptions([...required, '--apply']);
    const rehearsal = parseV18MigrationCliOptions([...required, '--dry-run']);

    expect(normal.mode).toBe(V18MigrationExecutionMode.promote());
    expect(compatibility.mode).toBe(V18MigrationExecutionMode.promote());
    expect(rehearsal.mode).toBe(V18MigrationExecutionMode.rehearse());
    expect(() => parseV18MigrationCliOptions([...required, '--apply', '--dry-run'])).toThrow(
      '--apply cannot be combined with --dry-run'
    );
  });

  it('reports Graph not found and the graphs that are present', async () => {
    const repositoryPath = await repositoryWithGraph(directories, 'think');
    const execution = await runMigrationProcess([
      '--repo',
      repositoryPath,
      '--graph',
      'events',
      '--yes',
    ]);

    expect(execution.exitCode).toBe(1);
    expect(execution.stderr).toContain('Graph not found: events');
    expect(execution.stderr).toContain('think — upgrade required (legacy unmarked substrate)');
    expect(execution.stderr).not.toContain('migration: empty');
  });

  it('requires explicit --yes before noninteractive inventory', async () => {
    const repositoryPath = await repositoryWithGraph(directories, 'think');
    const writerRef = 'refs/warp/think/writers/local';
    const before = await gitOk(repositoryPath, ['rev-parse', writerRef]);
    const execution = await runMigrationProcess(['--repo', repositoryPath, '--graph', 'think']);

    expect(execution.exitCode).toBe(1);
    expect(execution.stderr).toContain('Graphs found:');
    expect(execution.stderr).toContain('confirmation requires an interactive terminal');
    expect(execution.stderr).not.toContain('[inventory]');
    expect(await gitOk(repositoryPath, ['rev-parse', writerRef])).toBe(before);
  });
});

async function repositoryWithGraph(
  directories: MigrationTestDirectories,
  graph: string
): Promise<string> {
  const repositoryPath = await directories.create('git-warp-migration-cli-');
  await gitOk(repositoryPath, ['init', '--bare']);
  const oid = await gitOk(repositoryPath, ['hash-object', '-w', '--stdin'], 'legacy');
  await gitOk(repositoryPath, ['update-ref', `refs/warp/${graph}/writers/local`, oid]);
  return repositoryPath;
}

async function runMigrationProcess(
  args: readonly string[]
): Promise<Readonly<{ exitCode: number | null; stderr: string }>> {
  return await new Promise((complete, reject) => {
    const child = spawn(process.execPath, ['scripts/v18-to-v19/migrate.ts', ...args], {
      cwd: resolveProjectRoot(),
    });
    const stderr: Uint8Array[] = [];
    child.stderr.on('data', (chunk: Uint8Array) => stderr.push(chunk));
    child.on('error', reject);
    child.on('close', (exitCode) =>
      complete(
        Object.freeze({
          exitCode,
          stderr: Buffer.concat(stderr).toString('utf8'),
        })
      )
    );
  });
}

function resolveProjectRoot(): string {
  return process.cwd();
}
