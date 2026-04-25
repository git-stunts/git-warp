import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const umbrellaNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/DX_migrate-tests-and-seed-helpers-off-warpruntime.md'),
  'utf8',
);
const helperNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/DX_migrate-seed-and-runtime-helpers-off-warpruntime.md'),
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
  it('rewrites the old blocker as a closeout gate over explicit successor cuts', () => {
    expect(umbrellaNote).toContain('- `DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(umbrellaNote).toContain('- `DX_migrate-runtime-suites-off-warpruntime`');
  });

  it('describes helper/seed migration separately from broad suite migration', () => {
    expect(helperNote).toContain('test/helpers/*.ts');
    expect(helperNote).toContain('test/bats/helpers/*.ts');
    expect(helperNote).toContain('test/runtime/deno/helpers.ts');

    expect(suiteNote).toContain('test/unit/domain/WarpGraph*.test.ts');
    expect(suiteNote).toContain('instanceof WarpRuntime');
    expect(suiteNote).toContain('WarpCore');
  });

  it('records the new order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-tests-and-seed-helpers-off-warpruntime`');
  });
});
