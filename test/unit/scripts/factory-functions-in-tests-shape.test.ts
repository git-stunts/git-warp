import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import MarkdownDocument from '../../helpers/MarkdownDocument.ts';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

describe('factory-functions-in-tests closeout', () => {
  it('explains in the v17 ledger why the sludge card is already closed', () => {
    const releaseReadme = MarkdownDocument.fromFile(`${repoRoot}docs/releases/v17.0.0/README.md`);
    const task = releaseReadme.taskRow('SLUDGE_factory-functions-in-tests');

    expect(task?.status).toBe('x');
  });

  it('removes the stale live sludge note and dead workload row', () => {
    const workloads = MarkdownDocument.fromFile(
      `${repoRoot}docs/archive/backlog/github-issue-migration-2026-06-01/docs/method/backlog/WORKLOADS.md`,
    );

    expect(
      existsSync(
        `${repoRoot}docs/archive/backlog/v17.0.0-residual-backlog/SLUDGE_factory-functions-in-tests.md`
      )
    ).toBe(false);
    expect(workloads.taskRow('WL-35-v17-hygiene-sludge-seed')).toBeUndefined();
    expect(workloads.taskRow('SLUDGE_factory-functions-in-tests')).toBeUndefined();
  });

  it('stops the latest hygiene retro from pointing at the dead workload', () => {
    const retro = MarkdownDocument.fromFile(
      `${repoRoot}docs/method/retro/0054-type-import-and-template-expression-purge/type-import-and-template-expression-purge.md`,
    );

    expect(retro.taskRow('WL-35-v17-hygiene-sludge-seed')).toBeUndefined();
    expect(retro.taskRow('SLUDGE_factory-functions-in-tests')).toBeUndefined();
  });
});
