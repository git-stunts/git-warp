import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readText(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const changelog = readText('CHANGELOG.md');
const releaseNotes = readText('docs/releases/v18.0.0/README.md');

describe('v18 release story shape', () => {
  it('records the Worldline-first API in the v18 changelog entry', () => {
    expect(changelog).toContain('V18 public API now includes `openWarpWorldline()`');
    expect(changelog).toContain('`WarpWorldlineOpenOptions`');
    expect(changelog).toContain('`WarpWorldlinePatchBuild`');
    expect(changelog).toContain('Worldline-first application path');
  });

  it('records the same product story in the v18 release notes', () => {
    expect(releaseNotes).toContain('a Worldline-first public application entry point');
    expect(releaseNotes).toContain('`openWarpWorldline()`');
    expect(releaseNotes).toContain('compatibility, diagnostic');
  });

  it('keeps the residual-risk and non-goal story visible', () => {
    expect(releaseNotes).toContain('total raw content/property storage retirement');
    expect(releaseNotes).toContain('zero open issues in the `v18.0.0` milestone');
    expect(releaseNotes).toContain('row-specific cost labels');
    expect(releaseNotes).toContain('diagnostic, offline, and legacy surfaces');
    expect(releaseNotes).toContain('not first-use application evidence');
  });
});
