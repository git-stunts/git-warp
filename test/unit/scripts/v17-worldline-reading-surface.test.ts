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

  it('keeps traversal on read-model seams instead of private materialization', () => {
    const logicalTraversalSource = readRepoFile('src/domain/services/query/LogicalTraversal.ts');
    const observerSource = readRepoFile('src/domain/services/query/Observer.ts');
    const worldlineSource = readRepoFile('src/domain/services/Worldline.ts');

    expect(logicalTraversalSource).toContain('QueryReadModelProvider');
    expect(logicalTraversalSource).not.toContain('_materializeGraph');
    expect(observerSource).not.toMatch(/\b_materializeGraph\s*\(/u);
    expect(observerSource).not.toContain('ObserverBackingMaterializedGraph');
    expect(worldlineSource).not.toMatch(/\b_materializeGraph\s*\(/u);
    expect(worldlineSource).not.toContain('WorldlineMaterializedDelegate');
  });
});
