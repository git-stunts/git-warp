import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const guide = readFileSync(
  fileURLToPath(new URL('../../../docs/CLI_GUIDE.md', import.meta.url)),
  'utf8',
);

describe('CLI guide shape', () => {
  it('uses the current API to seed the sample graph', () => {
    expect(guide).toContain('# git warp CLI guide');
    expect(guide).toContain('## Create a sample graph');
    expect(guide).toContain('WarpApp.open({');
    expect(guide).not.toContain('WarpGraph.open({');
  });

  it('covers the current command families', () => {
    expect(guide).toContain('git warp query');
    expect(guide).toContain('git warp seek');
    expect(guide).toContain('git warp strand create');
    expect(guide).toContain('git warp strand transfer-plan');
    expect(guide).toContain('git warp debug coordinate');
    expect(guide).toContain('git warp verify-audit');
    expect(guide).toContain('git warp install-hooks');
  });

  it('frames the CLI as operational and inspection surface, not the app API', () => {
    expect(guide).toContain('The CLI is the operational and inspection surface.');
    expect(guide).toContain('For application code, use `WarpApp`.');
    expect(guide).toContain('Treat `materialize` as advanced substrate inspection, not the default app read path.');
    expect(guide).not.toContain('working-set');
  });

  it('includes a high-level command reference table', () => {
    expect(guide).toContain('## Command reference');
    expect(guide).toContain('| Command | Use it for | Notable flags |');
  });
});
