import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('Worldline-first legacy API deprecation posture', () => {
  it('marks openWarpGraph as an advanced compatibility surface', () => {
    const source = readRepoFile('src/domain/WarpGraph.ts');

    expect(source).toContain('@deprecated For application workflows, use openWarpWorldline().');
    expect(source).toContain('advanced capability bag remains supported');
  });

  it('marks WarpApp as a compatibility facade for graph-first migrations', () => {
    const source = readRepoFile('src/domain/WarpApp.ts');

    expect(source).toContain('@deprecated For new application workflows, use openWarpWorldline().');
    expect(source).toContain('compatibility facade');
  });

  it('keeps WarpCore supported for substrate diagnostics instead of first-use apps', () => {
    const source = readRepoFile('src/domain/WarpCore.ts');

    expect(source).toContain('@deprecated For application workflows, use openWarpWorldline().');
    expect(source).toContain('substrate tooling, diagnostics, replay');
  });

  it('moves the root module comments to the worldline-first entrypoint', () => {
    const source = readRepoFile('index.ts');

    expect(source).toContain('First-use application code should open a named worldline');
    expect(source).toContain('prefer openWarpWorldline');
  });
});
