import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const closeoutNotePath = join(
  process.cwd(),
  'docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md',
);
const closeoutCycle = readFileSync(
  join(process.cwd(), 'docs/design/0082-close-warpruntime-test-helper-migration.md'),
  'utf8',
);
const classDeleteNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md'),
  'utf8',
);
const suiteCycle = readFileSync(
  join(process.cwd(), 'docs/design/0081-migrate-runtime-suites-off-warpruntime.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('migrate warpruntime test/helper split', () => {
  it('closes the old closeout gate after helper and suite ratchets landed', () => {
    expect(existsSync(closeoutNotePath)).toBe(false);
    expect(closeoutCycle).toContain('helper and seed ratchets pass');
    expect(closeoutCycle).toContain('runtime-facing suite ratchet passes');
    expect(closeoutCycle).toContain('API_delete-warpruntime-class` is unblocked');
  });

  it('unblocks the class delete after the test/helper closeout', () => {
    expect(classDeleteNote).toContain('blocked_by: []');
    expect(classDeleteNote).not.toContain('DX_migrate-tests-and-seed-helpers-off-warpruntime');
  });

  it('keeps broad suite migration explicit after the helper migration landed', () => {
    expect(suiteCycle).toContain('Runtime-facing test suites no longer import');
    expect(suiteCycle).toContain('instanceof WarpRuntime');
    expect(suiteCycle).toContain('WarpCore');
    expect(suiteCycle).toContain('Cycle `0080` moved helper and seed entrypoints');
  });

  it('records the reduced order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).toMatch(/Cycle\s+0082 then closed/);
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).toContain('→ `API_kill-warpruntime`');
  });
});
