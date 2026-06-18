import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runNpmCommand(args: readonly string[]): string {
  const result = spawnSync('npm', [...args], {
    encoding: 'utf8',
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
    if (line === 'npm notice Tarball Contents') {
      inContents = true;
      continue;
    }
    if (line === 'npm notice Tarball Details') {
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

function packEntryPath(line: string): string | null {
  const match = /^npm notice\s+\S+\s+(.+)$/u.exec(line);
  return match?.[1] ?? null;
}

describe('release artifact command evidence', () => {
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
