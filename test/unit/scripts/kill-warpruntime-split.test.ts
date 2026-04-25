import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const runtimeKillNote = readFileSync(
  join(process.cwd(), 'docs/method/backlog/v17.0.0/API_kill-warpruntime.md'),
  'utf8',
);
const releaseLedger = readFileSync(
  join(process.cwd(), 'docs/releases/v17.0.0/README.md'),
  'utf8',
);

describe('kill warpruntime split', () => {
  it('rewrites the umbrella around the live remaining successor cuts', () => {
    expect(runtimeKillNote).toContain('- `API_delete-warpruntime-class`');
    expect(runtimeKillNote).toContain('cycle\n`0078` then extracted the remaining source-side runtime host product');
    expect(runtimeKillNote).toContain('cycle\n`0079` then proved the test/helper blocker still needed an internal split');
    expect(runtimeKillNote).toContain('cycle `0080` then completed the helper/seed half of that split');
    expect(runtimeKillNote).toContain('cycle `0076` then completed the `WarpCore` bridge cut');
    expect(runtimeKillNote).not.toContain('- `API_delete-openwarpruntime-bridge`');
    expect(runtimeKillNote).not.toContain('- `PORT_delete-warpcore-runtime-bridge`');
    expect(runtimeKillNote).not.toContain('This note is now the live remaining runtime-kill cut.');
  });

  it('records the same remaining order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0074 resplit the exposed');
    expect(releaseLedger).toContain('cycle 0075 then');
    expect(releaseLedger).toContain('Cycle 0076 then');
    expect(releaseLedger).toContain('Cycle 0078 then completed');
    expect(releaseLedger).toContain('Cycle 0079 then proved');
    expect(releaseLedger).toContain('Cycle 0080 then completed');
    expect(releaseLedger).not.toContain('`DX_migrate-seed-and-runtime-helpers-off-warpruntime`');
    expect(releaseLedger).toContain('`DX_migrate-runtime-suites-off-warpruntime`');
    expect(releaseLedger).toContain('`API_delete-warpruntime-class`');
    expect(releaseLedger).toContain('`DX_migrate-tests-and-seed-helpers-off-warpruntime`');
    expect(releaseLedger).not.toContain('`API_delete-openwarpruntime-bridge`');
    expect(releaseLedger).not.toContain('`PORT_delete-warpcore-runtime-bridge`');
    expect(releaseLedger).not.toContain('`PORT_extract-runtime-host-product`');
  });
});
