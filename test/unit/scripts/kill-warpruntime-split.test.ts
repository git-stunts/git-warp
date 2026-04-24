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
  it('blocks the umbrella on the three explicit successor cuts', () => {
    expect(runtimeKillNote).toContain('- API_warpgraph-runtime-bridge');
    expect(runtimeKillNote).toContain('- PORT_runtime-helper-wrapper-seams');
    expect(runtimeKillNote).toContain('- PROTO_delete-runtime-wiring-surface');
  });

  it('records the same split in the v17 release ledger', () => {
    expect(releaseLedger).toContain('cycle 0066 not-met');
    expect(releaseLedger).toContain('API_warpgraph-runtime-bridge');
    expect(releaseLedger).toContain('PORT_runtime-helper-wrapper-seams');
    expect(releaseLedger).toContain('PROTO_delete-runtime-wiring-surface');
  });
});
