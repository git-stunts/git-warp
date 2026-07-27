import { describe, expect, it } from 'vitest';

import {
  KNOWN_COMMANDS,
  parseArgs,
} from '../../../bin/cli/infrastructure.ts';
import { COMMANDS } from '../../../bin/cli/commands/registry.ts';

describe('v19 CLI base arguments', () => {
  it('parses one accepted command and preserves command arguments', () => {
    const parsed = parseArgs([
      'observe',
      '--observer',
      'users.role',
      '--reading',
      '{"kind":"node.exists","subject":"user:1"}',
    ]);

    expect(parsed.command).toBe('observe');
    expect(parsed.commandArgs).toEqual([
      '--observer',
      'users.role',
      '--reading',
      '{"kind":"node.exists","subject":"user:1"}',
    ]);
  });

  it('extracts Runtime options before or after the command', () => {
    const parsed = parseArgs([
      '--repo',
      '/tmp/repo',
      'write',
      '--lane',
      'events',
      '--writer',
      'alice',
      '--json',
    ]);

    expect(parsed.options).toMatchObject({
      repo: '/tmp/repo',
      lane: 'events',
      writer: 'alice',
      writerExplicit: true,
      json: true,
      jsonl: false,
    });
  });

  it('supports JSON Lines without the removed NDJSON alias', () => {
    const parsed = parseArgs(['observe', '--jsonl']);

    expect(parsed.options.jsonl).toBe(true);
    expect(parsed.commandArgs).not.toContain('--jsonl');
    expect(parseArgs(['observe', '--ndjson']).commandArgs)
      .toContain('--ndjson');
  });

  it('does not publish removed graph or view options', () => {
    expect(parseArgs(['write', '--graph', 'events']).commandArgs)
      .toEqual(['--graph', 'events']);
    expect(parseArgs(['observe', '--view', 'ascii']).commandArgs)
      .toEqual(['--view', 'ascii']);
  });

  it('defaults to local Runtime identity without a Lane', () => {
    expect(parseArgs([])).toMatchObject({
      command: undefined,
      options: {
        lane: null,
        writer: 'cli',
        writerExplicit: false,
        json: false,
        jsonl: false,
        help: false,
      },
    });
  });

  it('keeps the generated command list aligned with dispatch', () => {
    expect([...KNOWN_COMMANDS].sort()).toEqual(
      [...COMMANDS.keys()].sort(),
    );
  });
});
