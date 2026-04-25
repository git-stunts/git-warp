import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const umbrellaNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md'),
  'utf8',
);
const suiteNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/DX_migrate-runtime-suites-off-warpruntime.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('migrate warpruntime test/helper split', () => {
  it('rewrites the old blocker as a closeout gate over the remaining successor cut', () => {
    expect(umbrellaNote).not.toContain('- `DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(umbrellaNote).toContain('- `DX_migrate-runtime-suites-off-warpruntime`');
  });

  it('keeps broad suite migration explicit after the helper migration landed', () => {
    expect(suiteNote).toContain('test/unit/domain/WarpGraph*.test.ts');
    expect(suiteNote).toContain('instanceof WarpRuntime');
    expect(suiteNote).toContain('WarpCore');
    expect(suiteNote).toContain('Helper and seed surfaces no longer reopen the runtime class');
  });

  it('records the reduced order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-tests-and-seed-helpers-off-warpruntime`');
  });
});
