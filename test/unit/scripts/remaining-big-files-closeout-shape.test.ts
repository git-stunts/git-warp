import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

function readRepoFile(relativePath: string): string {
  return readFileSync(`${repoRoot}${relativePath}`, 'utf8');
}

describe('remaining-big-files closeout', () => {
  it('explains in the v17 ledger why the big-files card is already closed', () => {
    const releaseReadme = readRepoFile('docs/releases/v17.0.0/README.md');

    expect(releaseReadme).toContain('[x] GOD_remaining-big-files');
    expect(releaseReadme).toContain('cycle 0058 hill-met');
    expect(releaseReadme).toContain('0057');
    expect(releaseReadme).toContain('CORE_streaming-memory-audit');
    expect(releaseReadme).toContain('PROTO_purge-boundary-leaks');
  });

  it('removes the stale live note and dead workload item', () => {
    const workloads = readRepoFile('docs/method/backlog/WORKLOADS.md');

    expect(existsSync(`${repoRoot}docs/method/backlog/v17.0.0/GOD_remaining-big-files.md`)).toBe(false);
    expect(workloads).not.toContain('GOD_remaining-big-files');
  });

  it('drops the dead god from downstream blocker lists', () => {
    const apiMigrate = readRepoFile('docs/method/backlog/v17.0.0/API_migrate-consumers-to-capabilities.md');
    const sharedProviders = readRepoFile('docs/method/backlog/v17.0.0/CROSS_shared-provider-interfaces.md');

    expect(apiMigrate).not.toContain('GOD_remaining-big-files');
    expect(sharedProviders).not.toContain('GOD_remaining-big-files');
  });

  it('updates the historical wave and scorecard surfaces to current repo truth', () => {
    const wave = readRepoFile('docs/method/backlog/v17.0.0/TS_wave-09-gods-and-monsters.md');
    const scorecard = readRepoFile('docs/method/backlog/v17.0.0/SCORECARD.md');

    expect(wave).toContain('VisibleStateComparison.ts | 172');
    expect(wave).toContain('AuditVerifierService.ts | 136');
    expect(wave).toContain('StreamingBitmapIndexBuilder.ts | 277');
    expect(scorecard).toContain('CORE_streaming-memory-audit');
    expect(scorecard).toContain('PROTO_purge-boundary-leaks');
    expect(scorecard).not.toContain('## GOD_remaining-big-files');
  });
});
