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
  it('blocks the umbrella on the remaining explicit successor cuts', () => {
    expect(runtimeKillNote).toContain('- PORT_delete-runtime-controller-host-types');
    expect(runtimeKillNote).toContain('- PORT_delete-internal-runtime-shim');
    expect(runtimeKillNote).not.toContain('- API_openwarpgraph-composition-root');
  });

  it('records the same split in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0071 then completed');
    expect(releaseLedger).toContain('PORT_delete-runtime-controller-host-types');
    expect(releaseLedger).toContain('PORT_delete-internal-runtime-shim');
  });
});
