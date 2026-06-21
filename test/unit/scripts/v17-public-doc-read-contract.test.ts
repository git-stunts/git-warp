import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readDoc(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const readme = readDoc('README.md');
const docsIndex = readDoc('docs/README.md');
const gettingStarted = readDoc('docs/GETTING_STARTED.md');
const guide = readDoc('docs/GUIDE.md');
const apiReference = readDoc('docs/API_REFERENCE.md');
const changelog = readDoc('CHANGELOG.md');
const migrationGuide = readDoc('docs/migrations/v17.0.0.md');

describe('v17 public docs read contract', () => {
  it('keeps the materialization frontdoor out of first-use docs', () => {
    for (const doc of [readme, gettingStarted, guide]) {
      expect(doc).not.toContain('graph.materialize');
      expect(doc).not.toContain('graph.materialize.materialize');
      expect(doc).not.toContain('Call materialize()');
    }
  });

  it('keeps API Reference app-read sections off graph.materialize', () => {
    expect(apiReference).not.toContain('graph.materialize.materialize');
    expect(apiReference).not.toContain('Call materialize()');
    expect(apiReference).not.toContain('graph.query` and `graph.materialize` are the read-side capabilities');
    expect(apiReference).not.toContain('Reach for\n`graph.materialize` and `graph.patches`');
  });

  it('links the readings and optics guide from the public docs path', () => {
    for (const doc of [readme, docsIndex, gettingStarted, guide, apiReference]) {
      expect(doc).toContain('READINGS_AND_OPTICS.md');
    }
  });

  it('documents the substrate Plumbing to GitPlumbing rename as a v17 breaking change', () => {
    expect(changelog).toContain('`@git-stunts/plumbing` class rename');
    expect(changelog).toContain("import GitPlumbing from '@git-stunts/plumbing';");

    expect(migrationGuide).toContain('`@git-stunts/plumbing`: `Plumbing` → `GitPlumbing`');
    expect(migrationGuide).toContain("import GitPlumbing from '@git-stunts/plumbing';");
    expect(migrationGuide).toContain("import { Plumbing } from '@git-stunts/plumbing';");

    expect(apiReference).toContain('Do not import a named `Plumbing` symbol');
    expect(apiReference).toContain('v17 treats\nthat substrate rename as a breaking change');
  });
});
