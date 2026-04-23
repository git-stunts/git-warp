import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('factory-functions-in-tests closeout', () => {
  it('explains in the v17 ledger why the sludge card is already closed', () => {
    const releaseReadme = readRepoFile('docs/releases/v17.0.0/README.md');

    expect(releaseReadme).toContain('[x] SLUDGE_factory-functions-in-tests');
    expect(releaseReadme).toContain('cycle 0055 hill-met; constructor-wrapper');
    expect(releaseReadme).toContain('wire-format helpers remain intentional test');
  });

  it('removes the stale live sludge note and dead workload row', () => {
    const workloads = readRepoFile('docs/method/backlog/WORKLOADS.md');

    expect(existsSync(`${repoRoot}docs/method/backlog/v17.0.0/SLUDGE_factory-functions-in-tests.md`)).toBe(false);
    expect(workloads).not.toContain('WL-35-v17-hygiene-sludge-seed');
    expect(workloads).not.toContain('SLUDGE_factory-functions-in-tests');
  });

  it('stops the latest hygiene retro from pointing at the dead workload', () => {
    const retro = readRepoFile(
      'docs/method/retro/0054-type-import-and-template-expression-purge/type-import-and-template-expression-purge.md',
    );

    expect(retro).not.toContain('WL-35-v17-hygiene-sludge-seed');
    expect(retro).not.toContain('SLUDGE_factory-functions-in-tests');
  });
});
