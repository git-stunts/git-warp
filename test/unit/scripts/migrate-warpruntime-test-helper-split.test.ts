import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const umbrellaNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md'),
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
  it('rewrites the old blocker as an unblocked closeout gate', () => {
    expect(umbrellaNote).toContain('blocked_by: []');
    expect(umbrellaNote).not.toContain('- `DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(umbrellaNote).not.toContain('- `DX_migrate-runtime-suites-off-warpruntime`');
    expect(umbrellaNote).toContain('cycle `0081`');
  });

  it('keeps broad suite migration explicit after the helper migration landed', () => {
    expect(suiteCycle).toContain('Runtime-facing test suites no longer import');
    expect(suiteCycle).toContain('instanceof WarpRuntime');
    expect(suiteCycle).toContain('WarpCore');
    expect(suiteCycle).toContain('Cycle `0080` moved helper and seed entrypoints');
  });

  it('records the reduced order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-tests-and-seed-helpers-off-warpruntime`');
  });
});
