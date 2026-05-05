import { describe, expect, it } from 'vitest';

import { HELP_TEXT } from '../../../bin/cli/infrastructure.ts';

const LEGACY_FLAG = 'working' + '-' + 'set';
const LEGACY_LABEL = 'Working' + ' ' + 'Set';

describe('CLI help text shape', () => {
  it('includes the full strand subcommand family, including transfer-plan', () => {
    expect(HELP_TEXT).toContain('strand      Manage pinned strand descriptors');
    expect(HELP_TEXT).toContain('transfer-plan <id>');
    expect(HELP_TEXT).toContain('--into <sel>');
  });

  it('does not teach removed legacy strand terminology in the public help', () => {
    expect(HELP_TEXT).not.toContain(LEGACY_FLAG);
    expect(HELP_TEXT).not.toContain(LEGACY_LABEL);
  });
});
