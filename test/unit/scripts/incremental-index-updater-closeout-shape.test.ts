import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('incremental-index-updater closeout', () => {
  it('explains in the v17 ledger why the god card is already closed', () => {
    const releaseReadme = readRepoFile('docs/releases/v17.0.0/README.md');

    expect(releaseReadme).toContain('[x] GOD_incremental-index-updater');
    expect(releaseReadme).toContain('cycle 0056 hill-met; god split already landed');
    expect(releaseReadme).toContain('PROTO_purge-boundary-leaks');
    expect(releaseReadme).toContain('MODEL_incremental-index-updater-shape-sludge');
  });

  it('removes the stale live note and dead workload item', () => {
    const workloads = readRepoFile(
      'docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/WORKLOADS.md'
    );

    expect(
      existsSync(
        `${repoRoot}docs/archive/backlog/v17.0.0-residual-backlog/GOD_incremental-index-updater.md`
      )
    ).toBe(false);
    expect(workloads).not.toContain('GOD_incremental-index-updater');
  });

  it('drops the dead god from downstream blocker lists', () => {
    const apiMigrate = readRepoFile(
      'docs/archive/backlog/v17.0.0-residual-backlog/API_migrate-consumers-to-capabilities.md'
    );
    const sharedProviderCycle = readRepoFile(
      'docs/design/0085-close-shared-provider-interfaces.md'
    );

    expect(apiMigrate).not.toContain('GOD_incremental-index-updater');
    expect(sharedProviderCycle).toContain(
      'The stale `CROSS_shared-provider-interfaces` backlog card is removed'
    );
    expect(sharedProviderCycle).not.toContain('GOD_incremental-index-updater');
  });

  it('re-homes the historical wave and scorecard residue to the real remaining owners', () => {
    const wave = readRepoFile(
      'docs/archive/backlog/v17.0.0-residual-backlog/TS_wave-09-gods-and-monsters.md'
    );
    const scorecard = readRepoFile('docs/archive/backlog/v17.0.0-residual-backlog/SCORECARD.md');

    expect(wave).toContain('IncrementalIndexUpdater.ts | 495');
    expect(wave).toContain('remaining boundary/model cleanup lives elsewhere');
    expect(scorecard).toContain('PROTO_purge-boundary-leaks');
    expect(scorecard).toContain('MODEL_incremental-index-updater-shape-sludge');
  });
});
