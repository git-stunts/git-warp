import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const gettingStarted = readFileSync(
  fileURLToPath(new URL('../../../docs/GETTING_STARTED.md', import.meta.url)),
  'utf8',
);

describe('Getting Started doc shape', () => {
  it('covers the five-minute happy path from install to sync', () => {
    expect(gettingStarted).toContain('## Install');
    expect(gettingStarted).toContain('## Open a worldline');
    expect(gettingStarted).toContain('## Write the first patch');
    expect(gettingStarted).toContain('## Read current state');
    expect(gettingStarted).toContain('## Read earlier history');
    expect(gettingStarted).toContain('## Sync the worldline through Git');
  });

  it('uses a history-sensitive example and shows result shapes', () => {
    expect(gettingStarted).toContain('collaborative security audit worldline');
    expect(gettingStarted).toContain('openWarpWorldline');
    expect(gettingStarted).toContain('worldlineName: \'security-audit\'');
    expect(gettingStarted).toContain('const patch1 = await audit.commit');
    expect(gettingStarted).toContain('refs/warp/security-audit/writers/local');
    expect(gettingStarted).toContain("// patch1 = 'abc123...'");
    expect(gettingStarted).toContain("// patch2 = 'def456...'");
    expect(gettingStarted).toContain("stateHash: 'checkpoint-tail-query:{...read identity...}'");
    expect(gettingStarted).toContain("nodes: [{ id: 'finding:oauth-state-mismatch' }]");
    expect(gettingStarted).toContain("findingBeforeTriage.nodes = [{ id: 'finding:oauth-state-mismatch' }]");
  });

  it('shows explicit WARP ref sync and hands off to the next docs', () => {
    expect(gettingStarted).toContain("git fetch origin 'refs/warp/security-audit/*:refs/warp/security-audit/*'");
    expect(gettingStarted).toContain("git push origin 'refs/warp/security-audit/*:refs/warp/security-audit/*'");
    expect(gettingStarted).toContain('[Guide](GUIDE.md)');
    expect(gettingStarted).toContain('[API Reference](API_REFERENCE.md)');
    expect(gettingStarted).toContain('[Advanced Guide](ADVANCED_GUIDE.md)');
    expect(gettingStarted).toContain('[CLI Guide](CLI_GUIDE.md)');
  });
});
