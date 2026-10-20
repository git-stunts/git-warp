import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import ReleaseNotesComposer from '../../../scripts/release-notes/ReleaseNotesComposer.ts';

const CHANGELOG = `# Changelog

## [Unreleased]

### Fixed

- Unreleased work that must not ship in 20.1.0 notes.

## [20.1.0] - 2026-10-21

This release replaces the prototype Timeline API with \`Runtime\` and \`Lane\`.
See [upgrade guidance](docs/migrations/v19/README.md#upgrade) and
[an external page](https://example.com/page).

### Fixed

- A fix that belongs in the full changelog only.

### Compatibility

- Upgrade every reader and writer together.

### Breaking

- \`openWarp\` is removed.

## [20.0.0] - 2026-10-03

Older synopsis.
`;

const SUMMARY = '## Registry publish summary\n\n- npm: `published`\n- JSR: `published`\n';
const GENERATED = "## What's Changed\n* Prototype openWarp timelines by @dev in #700\n\n**Full Changelog**: v20.0.0...v20.1.0\n";

const composer = new ReleaseNotesComposer({ repository: 'git-stunts/git-warp', tag: 'v20.1.0' });

describe('ReleaseNotesComposer', () => {
  it('puts the dated synopsis, compatibility and breaking changes before generated PR history', () => {
    const notes = composer.compose({ changelog: CHANGELOG, summary: SUMMARY, existing: GENERATED });

    const order = ['## git-warp 20.1.0 (2026-10-21)', 'replaces the prototype Timeline API',
      '### Compatibility', '### Breaking', '## Registry publish summary', "## What's Changed",
      'Prototype openWarp timelines'].map((text) => notes.indexOf(text));
    expect(order.every((position) => position >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('keeps unreleased, other-version and ordinary fix entries out of the synopsis', () => {
    const notes = composer.compose({ changelog: CHANGELOG, summary: SUMMARY, existing: null });

    expect(notes).not.toContain('Unreleased work');
    expect(notes).not.toContain('Older synopsis');
    expect(notes).not.toContain('A fix that belongs in the full changelog only');
    expect(notes).toContain('https://github.com/git-stunts/git-warp/blob/v20.1.0/CHANGELOG.md');
  });

  it('pins repository-relative links to the tag and leaves external links alone', () => {
    const notes = composer.compose({ changelog: CHANGELOG, summary: SUMMARY, existing: null });

    expect(notes).toContain('(https://github.com/git-stunts/git-warp/blob/v20.1.0/docs/migrations/v19/README.md#upgrade)');
    expect(notes).toContain('(https://example.com/page)');
  });

  it('is idempotent across workflow reruns and keeps the generated history', () => {
    const first = composer.compose({ changelog: CHANGELOG, summary: SUMMARY, existing: GENERATED });
    const rerun = composer.compose({ changelog: CHANGELOG, summary: SUMMARY, existing: first });

    expect(rerun).toBe(first);
    expect(rerun.split("## What's Changed")).toHaveLength(2);
  });

  it('refuses a release whose version has no changelog section', () => {
    expect(() => new ReleaseNotesComposer({ repository: 'git-stunts/git-warp', tag: 'v9.9.9' })
      .compose({ changelog: CHANGELOG, summary: SUMMARY, existing: null }))
      .toThrow('CHANGELOG.md has no section for 9.9.9');
  });

  it('is what the release workflow uses to create and rerun the GitHub Release', () => {
    const workflow = readFileSync(new URL('../../../.github/workflows/release.yml', import.meta.url), 'utf8');

    expect(workflow).toContain('node scripts/release-notes/ComposeReleaseNotes.ts');
    expect(workflow).toMatch(/release create "\$TAG"[^\n]*--generate-notes[^\n]*--notes-file RELEASE_NOTES\.md/u);
    expect(workflow).not.toContain("awk 'BEGIN { keep = 0 }");
  });
});
