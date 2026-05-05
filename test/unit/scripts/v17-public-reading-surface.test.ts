import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('v17 public reading surface', () => {
  it('keeps openWarpGraph focused on readings instead of materialization', () => {
    const warpGraphSource = readRepoFile('src/domain/WarpGraph.ts');
    const runtimeProductSource = readRepoFile('src/domain/warp/RuntimeHostProduct.ts');
    const runtimeBridgeSource = readRepoFile('src/domain/warp/WarpGraphRuntimeProduct.ts');

    expect(warpGraphSource).not.toContain('MaterializeCapability');
    expect(warpGraphSource).not.toContain('bindMaterializeCapability');
    expect(warpGraphSource).not.toMatch(/\breadonly materialize:/u);
    expect(warpGraphSource).not.toMatch(/\bfolding:\s*Object\.freeze\(\{\s*materialize/u);
    expect(runtimeProductSource).not.toContain('MaterializeCapability');
    expect(runtimeBridgeSource).not.toMatch(/\bmaterialize(?:Coordinate|At)?\s*:/u);
  });

  it('documents the v17 migration as optic and query readings, not graph materialization', () => {
    const migrationGuide = readRepoFile('docs/migrations/v17.0.0.md');
    const apiReference = readRepoFile('docs/API_REFERENCE.md');

    expect(migrationGuide).toContain('graph.query');
    expect(migrationGuide).toContain('worldline');
    expect(migrationGuide).not.toContain('graph.materialize');
    expect(migrationGuide).not.toContain('SnapshotWarpState');
    expect(apiReference).not.toContain('| `graph.materialize` |');
    expect(apiReference).not.toContain('graph.materialize.materialize');
  });
});
