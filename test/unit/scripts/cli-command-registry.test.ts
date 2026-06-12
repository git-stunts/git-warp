import { describe, expect, it } from 'vitest';

import { KNOWN_COMMANDS, parseArgs } from '../../../bin/cli/infrastructure.ts';
import { COMMANDS } from '../../../bin/cli/commands/registry.ts';

const REPRESENTATIVE_COMMANDS = [
  'info',
  'check',
  'doctor',
  'query',
  'seek',
  'bisect',
  'debug',
  'strand',
  'verify-audit',
  'install-hooks',
] as const;

describe('CLI command registry', () => {
  it('keeps the parser command list aligned with the executable registry', () => {
    expect([...KNOWN_COMMANDS].sort()).toStrictEqual([...COMMANDS.keys()].sort());
  });

  it.each(REPRESENTATIVE_COMMANDS)('parses %s as an executable command', (command) => {
    expect(parseArgs([command, '--help'])).toMatchObject({
      command,
      options: { help: true },
    });
    expect(COMMANDS.has(command)).toBe(true);
  });
});
