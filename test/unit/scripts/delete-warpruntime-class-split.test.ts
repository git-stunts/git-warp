import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const classDeleteNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md'),
  'utf8',
);
const testsMigrationNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('delete warpruntime class split', () => {
  it('rewrites the class delete note around the last real successor blocker', () => {
    expect(classDeleteNote).not.toContain('- PORT_extract-runtime-host-product');
    expect(classDeleteNote).toContain('- DX_migrate-tests-and-seed-helpers-off-warpruntime');
  });

  it('keeps the remaining test-helper residue cut explicit', () => {
    expect(testsMigrationNote).toContain('WarpRuntime');
    expect(testsMigrationNote).not.toContain('DX_migrate-seed-and-runtime-helpers-off-warpruntime');
    expect(testsMigrationNote).not.toContain('DX_migrate-runtime-suites-off-warpruntime');
    expect(testsMigrationNote).toContain('helper ratchet and suite ratchet both pass');
  });

  it('records the reduced remaining order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0078 then completed');
    expect(releaseLedger).toContain('Cycle 0079 then proved');
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-tests-and-seed-helpers-off-warpruntime`');
    expect(releaseLedger).toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).not.toContain('`PORT_extract-runtime-host-product`');
  });
});
