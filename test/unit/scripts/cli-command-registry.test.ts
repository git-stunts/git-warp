import { existsSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { V19_CAPABILITY_CONTRACT }
  from '../../../bin/cli/capabilities/V19CapabilityContract.generated.ts';
import {
  KNOWN_COMMANDS,
  parseArgs,
} from '../../../bin/cli/infrastructure.ts';
import { COMMANDS } from '../../../bin/cli/commands/registry.ts';

const ACCEPTED_COMMANDS = [
  'write',
  'observe',
  'fork',
  'settle',
  'receipt',
  'doctor',
  'repair',
  'audit',
  'mcp',
] as const;

const REMOVED_COMMANDS = [
  'query',
  'path',
  'optic',
  'materialize',
  'seek',
  'strand',
  'checkpoint',
  'gc',
] as const;

const COMMAND_SOURCE_FILES = [
  'MaterializationRepair.ts',
  'audit.ts',
  'doctor-v19.ts',
  'fork.ts',
  'mcp.ts',
  'observe.ts',
  'receipt.ts',
  'registry.ts',
  'repair.ts',
  'settle.ts',
  'verify-audit.ts',
  'write.ts',
] as const;

describe('v19 CLI command registry', () => {
  it('is generated-contract complete', () => {
    expect(V19_CAPABILITY_CONTRACT.cli.map((entry) => entry.command))
      .toEqual(ACCEPTED_COMMANDS);
    expect([...KNOWN_COMMANDS]).toEqual(ACCEPTED_COMMANDS);
    expect([...COMMANDS.keys()]).toEqual(ACCEPTED_COMMANDS);
  });

  it.each(ACCEPTED_COMMANDS)(
    'parses and dispatches %s',
    (command) => {
      expect(parseArgs([command]).command).toBe(command);
      expect(COMMANDS.has(command)).toBe(true);
    },
  );

  it.each(REMOVED_COMMANDS)(
    'does not dispatch the removed %s command',
    (command) => {
      expect(COMMANDS.has(command)).toBe(false);
      expect(KNOWN_COMMANDS).not.toContain(command);
    },
  );

  it('ships only accepted commands and explicit diagnostic helpers', () => {
    const commandDirectory = new URL(
      '../../../bin/cli/commands/',
      import.meta.url,
    );
    const sourceFiles = readdirSync(commandDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)
      .sort();

    expect(sourceFiles).toEqual(COMMAND_SOURCE_FILES);
  });

  it('ships only the git-warp entry point', () => {
    expect(existsSync(new URL('../../../bin/git-warp.ts', import.meta.url)))
      .toBe(true);
    expect(existsSync(new URL('../../../bin/warp-graph.ts', import.meta.url)))
      .toBe(false);
  });
});
