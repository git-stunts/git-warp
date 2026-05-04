import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('v17 materialization contract docs', () => {
  it('names SnapshotWarpState as the public materialize return shape', () => {
    const migrationGuide = readRepoFile('docs/migrations/v17.0.0.md');
    const apiReference = readRepoFile('docs/API_REFERENCE.md');

    expect(migrationGuide).toContain('SnapshotWarpState');
    expect(migrationGuide).not.toContain('| `materialize()` return | `WarpStateV5` | `WarpState` | Same shape, new name |');
    expect(apiReference).toContain('SnapshotWarpState');
    expect(apiReference).not.toContain('// state = WarpState');
  });
});
