import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function readDoc(relativePath: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../../../${relativePath}`, import.meta.url)),
    'utf8',
  );
}

const rootReadme = readDoc('README.md');
const docsIndex = readDoc('docs/README.md');
const gettingStarted = readDoc('docs/GETTING_STARTED.md');
const guide = readDoc('docs/GUIDE.md');
const apiReference = readDoc('docs/API_REFERENCE.md');
const readingsAndOptics = readDoc('docs/READINGS_AND_OPTICS.md');
const migrationGuide = readDoc('docs/migrations/v18.0.0.md');

const firstUseDocs = [
  rootReadme,
  gettingStarted,
  guide,
  apiReference,
  migrationGuide,
] as const;

describe('v18 Worldline-first documentation guard', () => {
  it('keeps the live product docs anchored on openWarpWorldline', () => {
    for (const doc of firstUseDocs) {
      expect(doc).toContain('openWarpWorldline');
    }
    expect(docsIndex).toContain('migrations/v18.0.0.md');
  });

  it('keeps stale removal and graph-first claims out of the live learning path', () => {
    for (const doc of firstUseDocs) {
      expect(doc).not.toContain('will be removed in v18');
      expect(doc).not.toContain('`openWarpGraph()` is the public entry point');
      expect(doc).not.toContain('open with `WarpApp`');
      expect(doc).not.toContain('When you want to read the graph, you **materialize**');
    }
  });

  it('documents the v18 non-claims next to the migration advice', () => {
    expect(migrationGuide).toContain('v18 does not claim');
    expect(migrationGuide).toContain('full retirement of legacy content/property storage');
    expect(migrationGuide).toContain('native Continuum witnesshood');
    expect(migrationGuide).toContain('broader slice-first read execution');
    expect(migrationGuide).toContain('large-graph product gate');
    expect(migrationGuide).toContain('zero use of materialization inside the runtime');
  });

  it('keeps materialize classified as diagnostic rather than first-use app reading', () => {
    expect(migrationGuide).toContain('Diagnostic only; use worldline reads for apps');
    expect(migrationGuide).toContain('diagnostic replay, migration evidence, and tooling');
    expect(rootReadme).toContain('compatibility, diagnostics');
    expect(apiReference).toContain('Diagnostic replay/checkpoint');
  });

  it('keeps the readings and optics path receiver-qualified', () => {
    expect(readingsAndOptics).toContain(
      'openWarpWorldline() -> worldline.commit() -> worldline.live(), worldline.seek(), worldline.observer()',
    );
    expect(readingsAndOptics).toContain(
      'openWarpWorldline() -> worldline.prepareOpticBasis() -> worldline.coordinate() -> coordinate.optic()',
    );
    expect(readingsAndOptics).not.toContain(
      'openWarpWorldline() -> worldline.commit() -> worldline.live(), worldline.seek(), observer(), optic()',
    );
    expect(readingsAndOptics).not.toContain(
      'openWarpWorldline() -> worldline.prepareOpticBasis() -> coordinate() -> optic()',
    );
  });
});
