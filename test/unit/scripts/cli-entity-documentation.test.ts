import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('CLI entity documentation boundary', () => {
  it('keeps parser behavior tests independent from filesystem prose checks', () => {
    const parserSuite = readFileSync(
      new URL('../cli/v19-entity-intent.test.ts', import.meta.url),
      'utf8'
    );

    expect(parserSuite).not.toContain("from 'node:fs'");
  });

  it('documents the JSON and TypeScript occurrence surfaces separately', () => {
    const guide = readFileSync(new URL('../../../docs/topics/cli.md', import.meta.url), 'utf8');

    expect(guide).toContain('The CLI JSON envelope exposes only');
    expect(guide).toContain('The in-process TypeScript `EntityOccurrence`');
    expect(guide).toContain('Zero entity births emit `occurrence: null`');
    expect(guide).toContain('Exactly one entity birth emits an `occurrence` object');
    expect(guide).toContain('Two or more entity births emit `occurrence: null`');
  });
});
