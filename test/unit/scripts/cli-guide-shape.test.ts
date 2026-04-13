import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(
  fileURLToPath(new URL('../../../docs/CLI_GUIDE.md', import.meta.url)),
  'utf8',
);

describe('CLI guide shape', () => {
  it('positions the CLI as the operator surface', () => {
    expect(guide).toContain('# CLI guide');
    expect(guide).toContain("This is the operator's guide.");
    expect(guide).toContain('If you are building an app, start with the [Guide](GUIDE.md).');
    expect(guide).not.toContain('WarpRuntime');
  });

  it('organizes commands by workflow instead of as a flag bucket', () => {
    expect(guide).toContain('## Workflow 1: pre-flight checks');
    expect(guide).toContain('## Workflow 2: in-flight inspection');
    expect(guide).toContain('## Workflow 3: black-box recovery');
    expect(guide).toContain('## Workflow 4: debugger commands');
    expect(guide).toContain('## Workflow 5: speculative lanes');
    expect(guide).toContain('## Workflow 6: trust and maintenance');
  });

  it('covers the current command families and operator views', () => {
    expect(guide).toContain('git warp info');
    expect(guide).toContain('git warp check');
    expect(guide).toContain('git warp doctor');
    expect(guide).toContain('git warp query');
    expect(guide).toContain('git warp seek');
    expect(guide).toContain('git warp bisect');
    expect(guide).toContain('git warp debug conflicts');
    expect(guide).toContain('git warp strand create');
    expect(guide).toContain('git warp verify-audit');
    expect(guide).toContain('git warp install-hooks');
    expect(guide).toContain('active seek cursor');
  });
});
