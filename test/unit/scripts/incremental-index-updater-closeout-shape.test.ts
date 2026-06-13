import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('incremental-index-updater closeout', () => {
  it('explains in the v17 ledger why the god card is already closed', () => {
    const releaseReadme = MarkdownDocument.fromFile(`${repoRoot}docs/releases/v17.0.0/README.md`);
    const task = releaseReadme.taskRow('GOD_incremental-index-updater');

    expect(task?.status).toBe('x');
  });

  it('removes the stale live note and dead workload item', () => {
    const workloads = MarkdownDocument.fromFile(
      `${repoRoot}docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/WORKLOADS.md`,
    );

    expect(
      existsSync(
        `${repoRoot}docs/archive/backlog/v17.0.0-residual-backlog/GOD_incremental-index-updater.md`
      )
    ).toBe(false);
    expect(workloads.taskRow('GOD_incremental-index-updater')).toBeUndefined();
  });

  it('drops the dead god from downstream blocker lists', () => {
    const apiMigrate = MarkdownDocument.fromFile(
      `${repoRoot}docs/archive/backlog/v17.0.0-residual-backlog/API_migrate-consumers-to-capabilities.md`,
    );
    const sharedProviderCycle = MarkdownDocument.fromFile(
      `${repoRoot}docs/design/0085-close-shared-provider-interfaces.md`,
    );

    expect(apiMigrate.taskRow('GOD_incremental-index-updater')).toBeUndefined();
    expect(sharedProviderCycle.taskRow('CROSS_shared-provider-interfaces')).toBeUndefined();
    expect(sharedProviderCycle.taskRow('GOD_incremental-index-updater')).toBeUndefined();
  });

  it('re-homes the historical wave and scorecard residue to the real remaining owners', () => {
    const wave = MarkdownDocument.fromFile(
      `${repoRoot}docs/archive/backlog/v17.0.0-residual-backlog/TS_wave-09-gods-and-monsters.md`,
    );
    const scorecard = MarkdownDocument.fromFile(`${repoRoot}docs/archive/backlog/v17.0.0-residual-backlog/SCORECARD.md`);

    const incrementalUpdaterRow = wave.tableRowContainingCell('IncrementalIndexUpdater.ts');

    expect(incrementalUpdaterRow?.cells[2]).toBe('495');
    expect(scorecard.listItems()).toContain('`PROTO_purge-boundary-leaks`');
    expect(scorecard.listItems()).toContain('`MODEL_incremental-index-updater-shape-sludge`');
  });
});
