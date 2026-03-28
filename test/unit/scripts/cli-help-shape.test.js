import { describe, expect, it } from 'vitest';

import { HELP_TEXT } from '../../../bin/cli/infrastructure.js';

describe('CLI help text shape', () => {
  it('includes the full strand subcommand family, including transfer-plan', () => {
    expect(HELP_TEXT).toContain('strand      Manage pinned strand descriptors');
    expect(HELP_TEXT).toContain('transfer-plan <id>');
    expect(HELP_TEXT).toContain('--into <sel>');
  });

  it('does not teach removed working-set terminology in the public help', () => {
    expect(HELP_TEXT).not.toContain('working-set');
  });
});
