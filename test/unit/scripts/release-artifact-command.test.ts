import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

function runNpmPackDryRun(): string {
  const result = spawnSync('npm', ['pack', '--dry-run', '--ignore-scripts'], {
    encoding: 'utf8',
  });
  expect(result.error).toBeUndefined();
  expect(result.status).toBe(0);
  return `${result.stdout}\n${result.stderr}`;
}

describe('release artifact command evidence', () => {
  it('dry-runs the packed npm artifact and exposes the compiled public surface', () => {
    const output = runNpmPackDryRun();

    expect(output).toContain('npm notice Tarball Contents');
    expect(output).toContain('dist/index.js');
    expect(output).toContain('dist/index.d.ts');
    expect(output).toContain('dist/browser.js');
    expect(output).toContain('dist/bin/warp-graph.js');
    expect(output).toContain('bin/git-warp');
    expect(output).toContain('README.md');
    expect(output).toContain('CHANGELOG.md');
    expect(output).toContain('LICENSE');
    expect(output).not.toContain('docs/GUIDE.md');
    expect(output).not.toContain('src/domain/RuntimeHost.ts');
    expect(output).not.toContain('.github/maintainers');
  });
});
