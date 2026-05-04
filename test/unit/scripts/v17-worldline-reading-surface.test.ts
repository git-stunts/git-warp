import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('v17 worldline reading surface', () => {
  it('does not expose a public Worldline.materialize read path', () => {
    const worldlineSource = readRepoFile('src/domain/services/Worldline.ts');
    const apiReference = readRepoFile('docs/API_REFERENCE.md');
    const migrationGuide = readRepoFile('docs/migrations/v17.0.0.md');

    expect(worldlineSource).not.toMatch(/\basync\s+materialize\b/u);
    expect(worldlineSource).not.toMatch(/\bmaterializeSource\b/u);
    expect(apiReference).not.toContain('Worldline.materialize()');
    expect(migrationGuide).not.toContain('worldline.materialize');
  });
});
