import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const runtimeKillNotePath = join(
  process.cwd(),
  'docs/archive/backlog/v17.0.0-residual-backlog/API_kill-warpruntime.md',
);
const runtimeKillCycle = readFileSync(
  join(process.cwd(), 'docs/design/0084-close-warpruntime-umbrella.md'),
  'utf8',
);
const publishPipelineNote = readFileSync(
  join(process.cwd(), 'docs/archive/backlog/v17.0.0-residual-backlog/TS_publish-pipeline.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('kill warpruntime split', () => {
  it('closes the umbrella and unblocks launch-prep from it', () => {
    expect(existsSync(runtimeKillNotePath)).toBe(false);
    expect(runtimeKillCycle).toContain('`API_kill-warpruntime` is removed from the live backlog');
    expect(runtimeKillCycle).toContain('The runtime kill is done');
    expect(publishPipelineNote).not.toContain('API_kill-warpruntime');
  });

  it('records the same remaining order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0074 resplit the exposed');
    expect(releaseLedger).toContain('cycle 0075 then');
    expect(releaseLedger).toContain('Cycle 0076 then');
    expect(releaseLedger).toContain('Cycle 0078 then completed');
    expect(releaseLedger).toContain('Cycle 0079 then proved');
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).toContain('cycle 0081 then completed');
    expect(releaseLedger).toMatch(/Cycle\s+0082 then closed/);
    expect(releaseLedger).toMatch(/Cycle\s+0083 then deleted/);
    expect(releaseLedger).toMatch(/Cycle\s+0084 then closed/);
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).not.toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).toContain('[x] API_kill-warpruntime');
    expect(releaseLedger).not.toContain('`API_delete-openwarpruntime-bridge`');
    expect(releaseLedger).not.toContain('`PORT_delete-warpcore-runtime-bridge`');
    expect(releaseLedger).not.toContain('`PORT_extract-runtime-host-product`');
  });
});
