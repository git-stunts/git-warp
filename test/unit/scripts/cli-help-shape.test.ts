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

  it('frames materialize as diagnostic replay instead of the first-use read path', () => {
    expect(HELP_TEXT).toContain('Diagnostic replay/checkpoint for graph state');
    expect(HELP_TEXT).toContain('materialize <id>   Inspect a pinned strand replay');
    expect(HELP_TEXT).not.toContain('Materialize and checkpoint all graphs');
  });

  it('does not teach removed legacy strand terminology in the public help', () => {
    expect(HELP_TEXT).not.toContain(LEGACY_FLAG);
    expect(HELP_TEXT).not.toContain(LEGACY_LABEL);
  });
});
