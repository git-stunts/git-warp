import { describe, expect, it } from 'vitest';

import packageJson from '../../../package.json' with { type: 'json' };

describe('Node 22 CI command', () => {
  it('shards units and isolates the pipe-sensitive integration file', () => {
    expect(packageJson.scripts['test:node22:ci'])
      .toContain('npm run test:local');
    expect(packageJson.scripts['test:node22:ci'])
      .toContain('npm run test:integration:ci');
    expect(packageJson.scripts['test:integration:ci'])
      .toContain('--exclude test/integration/api/content-attachment.test.ts');
    expect(packageJson.scripts['test:integration:ci'])
      .toContain('content-attachment.test.ts --maxWorkers=1');
  });
});
