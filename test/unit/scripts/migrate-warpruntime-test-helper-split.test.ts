import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const closeoutNotePath = join(
  process.cwd(),
  'docs/method/graveyard/v17.0.0-residual-backlog/DX_migrate-tests-and-seed-helpers-off-warpruntime.md',
);
const closeoutCycle = readFileSync(
  join(process.cwd(), 'docs/design/0082-close-warpruntime-test-helper-migration.md'),
  'utf8',
);
const classDeleteCycle = readFileSync(
  join(process.cwd(), 'docs/design/0083-delete-runtime-host-class-name.md'),
  'utf8',
);
const runtimeKillCycle = readFileSync(
  join(process.cwd(), 'docs/design/0084-close-warpruntime-umbrella.md'),
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

  it('keeps the downstream class delete closed after the test/helper closeout', () => {
    expect(classDeleteCycle).toContain('The active source tree no longer contains `src/domain/WarpRuntime.ts`');
    expect(runtimeKillCycle).toContain('The runtime kill is done');
    expect(runtimeKillCycle).not.toContain('DX_migrate-tests-and-seed-helpers-off-warpruntime');
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
    expect(releaseLedger).toMatch(/Cycle\s+0083 then deleted/);
    expect(releaseLedger).toMatch(/Cycle\s+0084 then closed/);
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).not.toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).toContain('[x] API_kill-warpruntime');
  });
});
