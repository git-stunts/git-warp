import { describe, expect, it } from 'vitest';

import { V19_CAPABILITY_CONTRACT }
  from '../../../bin/cli/capabilities/V19CapabilityContract.generated.ts';
import { HELP_TEXT } from '../../../bin/cli/infrastructure.ts';

describe('v19 CLI help', () => {
  it('renders every generated command description and usage', () => {
    for (const capability of V19_CAPABILITY_CONTRACT.cli) {
      expect(HELP_TEXT).toContain(capability.command);
      expect(HELP_TEXT).toContain(capability.summary);
      expect(HELP_TEXT).toContain(capability.usage);
    }
  });

  it('teaches the canonical Runtime, Lane, and JSON Lines boundary', () => {
    expect(HELP_TEXT).toContain('--lane <name>');
    expect(HELP_TEXT).toContain('--jsonl');
    expect(HELP_TEXT).toContain('Runtime');
    expect(HELP_TEXT).toContain('Lane');
  });

  it.each([
    'warp-graph',
    '--graph',
    '--ndjson',
    '--view',
    'query result page',
    'session',
    'OID',
    'cache management',
  ])('omits removed public vocabulary %s', (term) => {
    expect(HELP_TEXT).not.toContain(term);
  });
});
