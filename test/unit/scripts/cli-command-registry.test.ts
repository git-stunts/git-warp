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
  'sync',
  'serve',
  'fork',
  'checkpoint',
  'gc',
  'watch',
] as const;

const CLI_GAP_CLOSEOUT_COMMANDS = [
  'sync',
  'serve',
  'fork',
  'checkpoint',
  'gc',
  'watch',
] as const;

const INTENTIONALLY_OMITTED_COMMANDS = [
  'export',
  'import',
  'upgrade',
  'migrate',
] as const;

describe('CLI command registry', () => {
  it('keeps the parser command list aligned with the executable registry', () => {
    expect([...KNOWN_COMMANDS].sort()).toStrictEqual([...COMMANDS.keys()].sort());
  });

  it.each(CLI_GAP_CLOSEOUT_COMMANDS)('registers the #504 command family %s', (command) => {
    expect(KNOWN_COMMANDS).toContain(command);
    expect(COMMANDS.has(command)).toBe(true);
  });

  it.each(INTENTIONALLY_OMITTED_COMMANDS)('keeps %s omitted until its boundary exists', (command) => {
    expect(KNOWN_COMMANDS).not.toContain(command);
    expect(COMMANDS.has(command)).toBe(false);
  });

  it.each(REPRESENTATIVE_COMMANDS)('parses %s as an executable command', (command) => {
    expect(parseArgs([command, '--help'])).toMatchObject({
      command,
      options: { help: true },
    });
    expect(COMMANDS.has(command)).toBe(true);
  });
});
