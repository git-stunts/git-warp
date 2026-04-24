import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const migrationNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_migrate-consumers-to-capabilities.md'),
  'utf8',
);
const runtimeKillNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_kill-warpruntime.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('capability consumer migration closeout', () => {
  it('records the migration note as satisfied by the consumer tranches', () => {
    expect(migrationNote).toContain('## 0065 closeout');
    expect(migrationNote).toContain('That means this note is now materially satisfied.');
    expect(migrationNote).toContain('Those cuts now belong under `API_kill-warpruntime`.');
  });

  it('does not keep API_kill-warpruntime blocked on consumer migration', () => {
    expect(runtimeKillNote).not.toContain('- API_migrate-consumers-to-capabilities');
  });

  it('marks consumer migration done in the v17 release ledger', () => {
    expect(releaseLedger).toContain('[x] API_migrate-consumers-to-capabilities');
    expect(releaseLedger).toContain('The consumer migration task is now');
    expect(releaseLedger).toContain('composition-root residue');
  });
});
