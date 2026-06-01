import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('content-access duplication closeout', () => {
  it('marks the v17 ledger entry as closed and absorbed by the shared seam', () => {
    const releaseReadme = readRepoFile('docs/releases/v17.0.0/README.md');

    expect(releaseReadme).toContain('[x] SLUDGE_content-access-duplication');
    expect(releaseReadme).toContain('cycle 0051 hill-met; implementation duplication already');
    expect(releaseReadme).toContain('reduced into `QueryContent.ts`');
  });

  it('makes capability migration own the deferred content accessor surface', () => {
    const migrateNote = readRepoFile('docs/method/graveyard/v17.0.0-residual-backlog/API_migrate-consumers-to-capabilities.md');

    expect(migrateNote).toContain('NodeContent');
    expect(migrateNote).toContain('EdgeContent');
    expect(migrateNote).toContain('content accessor');
  });

  it('removes the stale live sludge note from the v17 lane', () => {
    expect(existsSync(`${repoRoot}docs/method/graveyard/v17.0.0-residual-backlog/SLUDGE_content-access-duplication.md`)).toBe(false);
  });
});
