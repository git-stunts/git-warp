import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const classDeleteNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md'),
  'utf8',
);
const hostProductNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/PORT_extract-runtime-host-product.md'),
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
  it('rewrites the class delete note around the real successor blockers', () => {
    expect(classDeleteNote).toContain('- PORT_extract-runtime-host-product');
    expect(classDeleteNote).toContain('- DX_migrate-tests-and-seed-helpers-off-warpruntime');
  });

  it('records the two new residue cuts explicitly', () => {
    expect(hostProductNote).toContain('WarpGraphRuntimeProduct.ts');
    expect(hostProductNote).toContain('WarpCoreRuntimeProduct.ts');
    expect(hostProductNote).toContain('ForkController.ts');

    expect(testsMigrationNote).toContain('WarpRuntime');
    expect(testsMigrationNote).toContain('WarpCore.open(...)');
    expect(testsMigrationNote).toContain('openWarpGraph(...)');
  });

  it('records the new order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0077 then proved');
    expect(releaseLedger).toContain('`PORT_extract-runtime-host-product`');
    expect(releaseLedger).toContain('`DX_migrate-tests-and-seed-helpers-off-warpruntime`');
    expect(releaseLedger).toContain('`API_delete-warpruntime-class`');
  });
});
