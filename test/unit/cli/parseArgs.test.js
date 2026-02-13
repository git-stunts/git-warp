import { describe, it, expect } from 'vitest';
import { parseArgs, KNOWN_COMMANDS } from '../../../bin/cli/infrastructure.js';
import { COMMANDS } from '../../../bin/cli/commands/registry.js';

describe('parseArgs (base)', () => {
  it('parses command as first positional', () => {
    const { command, commandArgs } = parseArgs(['info']);
    expect(command).toBe('info');
    expect(commandArgs).toEqual([]);
  });

  it('passes remaining args as commandArgs', () => {
    const { command, commandArgs } = parseArgs(['query', '--match', '*']);
    expect(command).toBe('query');
    expect(commandArgs).toEqual(['--match', '*']);
  });

  it('returns undefined command when no positionals', () => {
    const { command } = parseArgs([]);
    expect(command).toBeUndefined();
  });

  it('parses --repo with short -r alias', () => {
    const { options } = parseArgs(['-r', '/tmp/repo', 'info']);
    expect(options.repo).toBe('/tmp/repo');
  });

  it('parses --json boolean', () => {
    const { options } = parseArgs(['--json', 'info']);
    expect(options.json).toBe(true);
  });

  it('parses --ndjson boolean', () => {
    const { options } = parseArgs(['--ndjson', 'info']);
    expect(options.ndjson).toBe(true);
  });

  it('parses --graph string', () => {
    const { options } = parseArgs(['--graph', 'myGraph', 'info']);
    expect(options.graph).toBe('myGraph');
  });

  it('parses --writer string with default', () => {
    const { options } = parseArgs(['info']);
    expect(options.writer).toBe('cli');
  });

  it('parses --writer override', () => {
    const { options } = parseArgs(['--writer', 'alice', 'info']);
    expect(options.writer).toBe('alice');
  });

  it('parses -h as help', () => {
    const { options } = parseArgs(['-h']);
    expect(options.help).toBe(true);
  });

  it('parses --help', () => {
    const { options } = parseArgs(['--help']);
    expect(options.help).toBe(true);
  });

  describe('--view handling', () => {
    it('--view without value defaults to ascii', () => {
      const { options } = parseArgs(['--view', 'info']);
      expect(options.view).toBe('ascii');
    });

    it('--view with explicit ascii', () => {
      const { options } = parseArgs(['--view', 'ascii', 'info']);
      expect(options.view).toBe('ascii');
    });

    it('--view with browser mode', () => {
      const { options } = parseArgs(['--view', 'browser', 'info']);
      expect(options.view).toBe('browser');
    });

    it('--view with svg:FILE mode', () => {
      const { options } = parseArgs(['--view', 'svg:out.svg', 'info']);
      expect(options.view).toBe('svg:out.svg');
    });

    it('--view with html:FILE mode', () => {
      const { options } = parseArgs(['--view', 'html:out.html', 'info']);
      expect(options.view).toBe('html:out.html');
    });

    it('--view as last arg defaults to ascii', () => {
      const { options } = parseArgs(['info', '--view']);
      expect(options.view).toBe('ascii');
    });

    it('--view followed by a flag defaults to ascii', () => {
      const { options } = parseArgs(['--view', '--json', 'info']);
      expect(options.view).toBe('ascii');
    });

    it('--view with invalid mode throws', () => {
      expect(() => parseArgs(['--view', 'invalid', 'info'])).toThrow(/invalid view mode/i);
    });
  });

  describe('defaults', () => {
    it('json defaults to false', () => {
      const { options } = parseArgs(['info']);
      expect(options.json).toBe(false);
    });

    it('ndjson defaults to false', () => {
      const { options } = parseArgs(['info']);
      expect(options.ndjson).toBe(false);
    });

    it('view defaults to null', () => {
      const { options } = parseArgs(['info']);
      expect(options.view).toBeNull();
    });

    it('graph defaults to null', () => {
      const { options } = parseArgs(['info']);
      expect(options.graph).toBeNull();
    });
  });

  describe('command args passthrough', () => {
    it('passes unknown flags as commandArgs for commands', () => {
      const { command, commandArgs } = parseArgs(['seek', '--tick', '5']);
      expect(command).toBe('seek');
      expect(commandArgs).toEqual(['--tick', '5']);
    });

    it('passes positionals after command', () => {
      const { command, commandArgs } = parseArgs(['path', 'node:a', 'node:b']);
      expect(command).toBe('path');
      expect(commandArgs).toEqual(['node:a', 'node:b']);
    });
  });

  describe('KNOWN_COMMANDS sync', () => {
    it('KNOWN_COMMANDS matches the COMMANDS registry', () => {
      expect([...KNOWN_COMMANDS].sort()).toEqual([...COMMANDS.keys()].sort());
    });
  });
});
