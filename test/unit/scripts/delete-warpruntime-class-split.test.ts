import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const classDeleteNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md'),
  'utf8',
);
const closeoutCycle = readFileSync(
  join(process.cwd(), 'docs/design/0082-close-warpruntime-test-helper-migration.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('delete warpruntime class split', () => {
  it('unblocks the class delete note after the test/helper closeout', () => {
    expect(classDeleteNote).toContain('blocked_by: []');
    expect(classDeleteNote).not.toContain('- PORT_extract-runtime-host-product');
    expect(classDeleteNote).not.toContain('DX_migrate-tests-and-seed-helpers-off-warpruntime');
    expect(classDeleteNote).toContain('remove `WarpRuntime` as the public/internal graph product');
  });

  it('records that the test-helper closeout gate closed', () => {
    expect(closeoutCycle).toContain('helper and suite ratchets prove test/helper surfaces');
    expect(closeoutCycle).toContain('The next actionable v17 runtime-kill item is now');
    expect(closeoutCycle).toContain('`API_delete-warpruntime-class`');
  });

  it('records the reduced remaining order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0078 then completed');
    expect(releaseLedger).toContain('Cycle 0079 then proved');
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).toMatch(/Cycle\s+0082 then closed/);
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).not.toContain('`PORT_extract-runtime-host-product`');
  });
});
