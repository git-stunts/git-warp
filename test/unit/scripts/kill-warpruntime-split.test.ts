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
  it('rewrites the umbrella around the remaining explicit successor cuts', () => {
    expect(runtimeKillNote).toContain('- `API_delete-openwarpruntime-bridge`');
    expect(runtimeKillNote).toContain('- `PORT_delete-warpcore-runtime-bridge`');
    expect(runtimeKillNote).toContain('- `API_delete-warpruntime-class`');
    expect(runtimeKillNote).not.toContain('This note is now the live remaining runtime-kill cut.');
  });

  it('records the same final order in the v17 release ledger', () => {
    expect(releaseLedger).toContain('Cycle 0074 resplit the exposed');
    expect(releaseLedger).toContain('`API_delete-openwarpruntime-bridge`');
    expect(releaseLedger).toContain('`PORT_delete-warpcore-runtime-bridge`');
    expect(releaseLedger).toContain('`API_delete-warpruntime-class`');
  });
});
