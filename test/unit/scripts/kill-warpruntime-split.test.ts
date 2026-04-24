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
  it('records that the umbrella is no longer blocked by successor shim cuts', () => {
    expect(runtimeKillNote).toContain('This note is now the live remaining runtime-kill cut.');
    expect(runtimeKillNote).not.toContain('- PORT_delete-internal-runtime-shim');
    expect(runtimeKillNote).not.toContain('- PORT_delete-runtime-controller-host-types');
    expect(runtimeKillNote).not.toContain('- API_openwarpgraph-composition-root');
  });

  it('records the shim closeout in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0073 then deleted the');
    expect(releaseLedger).toContain('`_internal.ts` compatibility shim');
    expect(releaseLedger).not.toContain('PORT_delete-runtime-controller-host-types');
  });
});
