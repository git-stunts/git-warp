import {
  spawnSync,
  type SpawnSyncOptionsWithStringEncoding,
  type SpawnSyncReturns,
} from 'node:child_process';
import { describe, expect, it } from 'vitest';

const COMMAND_TIMEOUT_MS = 120_000;

type CommandRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding
) => SpawnSyncReturns<string>;

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeout: SpawnSyncOptionsWithStringEncoding['timeout'];
  readonly killSignal: SpawnSyncOptionsWithStringEncoding['killSignal'];
};

type PackSectionName = 'Tarball Contents' | 'Tarball Details';

const defaultCommandRunner: CommandRunner = (command, args, options) =>
  spawnSync(command, [...args], options);

function runNpmCommand(
  args: readonly string[],
  runner: CommandRunner = defaultCommandRunner
): string {
  const result = runner('npm', [...args], {
    encoding: 'utf8',
    timeout: COMMAND_TIMEOUT_MS,
    killSignal: 'SIGKILL',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

function runNpmPackDryRun(): string {
  runNpmCommand(['run', 'build', '--silent']);
  return runNpmCommand(['pack', '--dry-run', '--ignore-scripts', '--no-json']);
}

function packEntries(output: string): ReadonlySet<string> {
  const entries = new Set<string>();
  let inContents = false;
  for (const line of output.split('\n')) {
    if (isPackSectionHeader(line, 'Tarball Contents')) {
      inContents = true;
      continue;
    }
    if (isPackSectionHeader(line, 'Tarball Details')) {
      break;
    }
    if (!inContents) {
      continue;
    }
    const entry = packEntryPath(line);
    if (entry !== null) {
      entries.add(entry);
    }
  }
  return entries;
}

function isPackSectionHeader(line: string, sectionName: PackSectionName): boolean {
  const normalizedHeader = line.replaceAll('=', '').replace(/\s+/gu, ' ').trim();
  return line.includes(sectionName) && normalizedHeader === `npm notice ${sectionName}`;
}

function packEntryPath(line: string): string | null {
  const match = /^npm notice\s+\S+\s+(.+)$/u.exec(line);
  return match?.[1] ?? null;
}

function isSupportedV18ToV19Artifact(path: string): boolean {
  const prefix = 'dist/scripts/v18-to-v19/';
  if (!path.startsWith(prefix)) {
    return false;
  }
  const relativePath = path.slice(prefix.length);
  return (
    relativePath.startsWith('adapters/') ||
    (!relativePath.includes('/') &&
      (relativePath.endsWith('.js') || relativePath.endsWith('.d.ts')))
  );
}

function successfulSpawnResult(stdout: string): SpawnSyncReturns<string> {
  return {
    pid: 0,
    output: [null, stdout, ''],
    stdout,
    stderr: '',
    status: 0,
    signal: null,
  };
}

describe('release artifact command evidence', () => {
  it('bounds npm subprocesses with a timeout', () => {
    const calls: SpawnCall[] = [];
    const recordingRunner: CommandRunner = (command, args, options) => {
      calls.push({
        command,
        args: [...args],
        timeout: options.timeout,
        killSignal: options.killSignal,
      });
      return successfulSpawnResult('10.0.0\n');
    };

    runNpmCommand(['--version'], recordingRunner);

    expect(calls).toEqual([
      {
        command: 'npm',
        args: ['--version'],
        timeout: COMMAND_TIMEOUT_MS,
        killSignal: 'SIGKILL',
      },
    ]);
  });

  it('parses decorated npm pack section headers', () => {
    const entries = packEntries(
      [
        'npm notice === Tarball Contents ===',
        'npm notice 1.2kB dist/index.js',
        'npm notice === Tarball Details ===',
        'npm notice name: @git-stunts/git-warp',
      ].join('\n')
    );

    expect(entries).toEqual(new Set(['dist/index.js']));
  });

  it('dry-runs the packed npm artifact and exposes the compiled public surface', () => {
    const entries = packEntries(runNpmPackDryRun());

    const compiledTests = [...entries].filter((entry) => entry.startsWith('dist/test/'));
    const unrelatedCompiledScripts = [...entries].filter(
      (entry) =>
        entry.startsWith('dist/scripts/') &&
        !isSupportedV18ToV19Artifact(entry) &&
        !entry.startsWith('dist/scripts/migrations/v17.0.0/') &&
        entry !== 'dist/scripts/formatFailure.js' &&
        entry !== 'dist/scripts/formatFailure.d.ts' &&
        entry !== 'dist/scripts/upgrade-v16-to-v17.js' &&
        entry !== 'dist/scripts/upgrade-v16-to-v17.d.ts'
    );

    expect(entries.has('dist/index.js')).toBe(true);
    expect(entries.has('dist/index.d.ts')).toBe(true);
    expect(entries.has('dist/scripts/upgrade-v16-to-v17.js')).toBe(true);
    expect(entries.has('dist/scripts/upgrade-v16-to-v17.d.ts')).toBe(true);
    expect(entries.has('dist/browser.js')).toBe(false);
    expect(entries.has('dist/browser.d.ts')).toBe(false);
    expect(entries.has('dist/legacy.js')).toBe(false);
    expect(entries.has('dist/legacy.d.ts')).toBe(false);
    expect(entries.has('dist/rootCompatibility.js')).toBe(false);
    expect(entries.has('dist/rootCompatibility.d.ts')).toBe(false);
    expect(entries.has('dist/bin/git-warp.js')).toBe(true);
    expect(entries.has('bin/git-warp')).toBe(true);
    expect(entries.has('dist/bin/warp-graph.js')).toBe(false);
    expect(entries.has('README.md')).toBe(true);
    expect(entries.has('docs/migrations/v19/README.md')).toBe(true);
    expect(entries.has('docs/operations/README.md')).toBe(true);
    expect(entries.has('docs/topics/README.md')).toBe(true);
    expect(entries.has('docs/topics/api/README.md')).toBe(true);
    expect(entries.has('docs/topics/getting-started.md')).toBe(true);
    expect(entries.has('docs/READINGS_AND_OPTICS.md')).toBe(true);
    expect(entries.has('docs/operations/package-payload.md')).toBe(true);
    expect(entries.has('CHANGELOG.md')).toBe(true);
    expect(entries.has('LICENSE')).toBe(true);
    expect(compiledTests).toEqual([]);
    expect(unrelatedCompiledScripts).toEqual([]);
    expect(entries.has('docs/ANTI_SLUDGE_POLICY.md')).toBe(false);
    expect(entries.has('docs/plans/streaming-indexed-recursive-warp.md')).toBe(false);
    expect(entries.has('docs/GUIDE.md')).toBe(false);
    expect(entries.has('src/domain/RuntimeHost.ts')).toBe(false);
    expect(entries.has('.github/maintainers')).toBe(false);
  });
});
