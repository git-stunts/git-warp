import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('v17 materialization contract docs', () => {
  it('does not describe materialization as the public v17 read contract', () => {
    const migrationGuide = readRepoFile('docs/migrations/v17.0.0.md');
    const apiReference = readRepoFile('docs/API_REFERENCE.md');

    expect(migrationGuide).toContain('graph.query');
    expect(migrationGuide).toContain('worldline');
    expect(migrationGuide).not.toContain('SnapshotWarpState');
    expect(migrationGuide).not.toContain('graph.materialize.materialize');
    expect(migrationGuide).not.toContain('| `materialize()` return | `WarpStateV5` | `WarpState` | Same shape, new name |');
    expect(apiReference).not.toContain('graph.materialize.materialize');
    expect(apiReference).not.toContain('// state = WarpState');
  });
});
