import { spawnSync, type SpawnSyncOptionsWithStringEncoding, type SpawnSyncReturns } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const COMMAND_TIMEOUT_MS = 120_000;

type CommandRunner = (
  command: string,
  args: readonly string[],
  options: SpawnSyncOptionsWithStringEncoding,
) => SpawnSyncReturns<string>;

type SpawnCall = {
  readonly command: string;
  readonly args: readonly string[];
  readonly timeout: SpawnSyncOptionsWithStringEncoding['timeout'];
  readonly killSignal: SpawnSyncOptionsWithStringEncoding['killSignal'];
};

type PackSectionName = 'Tarball Contents' | 'Tarball Details';

const defaultCommandRunner: CommandRunner = (command, args, options) => spawnSync(command, [...args], options);

function runNpmCommand(args: readonly string[], runner: CommandRunner = defaultCommandRunner): string {
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
  return runNpmCommand(['pack', '--dry-run', '--ignore-scripts']);
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

    expect(calls).toEqual([{
      command: 'npm',
      args: ['--version'],
      timeout: COMMAND_TIMEOUT_MS,
      killSignal: 'SIGKILL',
    }]);
  });

  it('parses decorated npm pack section headers', () => {
    const entries = packEntries([
      'npm notice === Tarball Contents ===',
      'npm notice 1.2kB dist/index.js',
      'npm notice === Tarball Details ===',
      'npm notice name: @git-stunts/git-warp',
    ].join('\n'));

    expect(entries).toEqual(new Set(['dist/index.js']));
  });

  it('dry-runs the packed npm artifact and exposes the compiled public surface', () => {
    const entries = packEntries(runNpmPackDryRun());

    expect(entries.has('dist/index.js')).toBe(true);
    expect(entries.has('dist/index.d.ts')).toBe(true);
    expect(entries.has('dist/browser.js')).toBe(true);
    expect(entries.has('dist/bin/warp-graph.js')).toBe(true);
    expect(entries.has('bin/git-warp')).toBe(true);
    expect(entries.has('README.md')).toBe(true);
    expect(entries.has('CHANGELOG.md')).toBe(true);
    expect(entries.has('LICENSE')).toBe(true);
    expect(entries.has('docs/GUIDE.md')).toBe(false);
    expect(entries.has('src/domain/RuntimeHost.ts')).toBe(false);
    expect(entries.has('.github/maintainers')).toBe(false);
  });
});
