import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const classDeleteNotePath = join(
  process.cwd(),
  'docs/method/backlog/v17.0.0/API_delete-warpruntime-class.md',
);
const runtimeHostSource = readFileSync(
  join(process.cwd(), 'src/domain/RuntimeHost.ts'),
  'utf8',
);
const runtimeFilePath = join(process.cwd(), 'src/domain/WarpRuntime.ts');
const runtimeKillCycle = readFileSync(
  join(process.cwd(), 'docs/design/0084-close-warpruntime-umbrella.md'),
  'utf8',
);
const classDeleteCycle = readFileSync(
  join(process.cwd(), 'docs/design/0083-delete-runtime-host-class-name.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('delete warpruntime class split', () => {
  it('deletes the old class source and opener residue', () => {
    expect(existsSync(runtimeFilePath)).toBe(false);
    expect(existsSync(classDeleteNotePath)).toBe(false);
    expect(runtimeHostSource).toContain('export default class RuntimeHost');
    expect(runtimeHostSource).toContain('export async function openRuntimeHost(');
    expect(runtimeHostSource).not.toContain('export default class WarpRuntime');
    expect(runtimeHostSource).not.toContain('openWarpRuntime(');
    expect(runtimeHostSource).not.toContain('getWarpRuntimePrototype');
  });

  it('feeds the umbrella closeout after the class delete', () => {
    expect(runtimeKillCycle).toContain('Cycles `0067`');
    expect(runtimeKillCycle).toContain('through `0083` removed the bridge');
    expect(runtimeKillCycle).not.toContain('- API_delete-warpruntime-class');
    expect(classDeleteCycle).toContain('The active source tree no longer contains `src/domain/WarpRuntime.ts`');
  });

  it('records the reduced remaining order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0078 then completed');
    expect(releaseLedger).toContain('Cycle 0079 then proved');
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).toMatch(/Cycle\s+0082 then closed/);
    expect(releaseLedger).toMatch(/Cycle\s+0083 then deleted/);
    expect(releaseLedger).toMatch(/Cycle\s+0084 then closed/);
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).not.toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).toContain('[x] API_kill-warpruntime');
    expect(releaseLedger).not.toContain('`PORT_extract-runtime-host-product`');
  });
});
