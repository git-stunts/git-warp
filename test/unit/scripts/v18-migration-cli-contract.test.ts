import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  V18_MIGRATION_CLI_COMMAND,
  V18_MIGRATION_CLI_FLAGS,
  V18_MIGRATION_CLI_PLACEHOLDERS,
  V18_MIGRATION_CLI_SEMANTICS,
} from '../../../scripts/v18-to-v19/V18MigrationCliContract.ts';
import {
  V18_MIGRATION_CLI_EXAMPLES,
  V18_MIGRATION_CLI_OUTCOMES,
} from '../../../scripts/v18-to-v19/V18MigrationCliGuidance.ts';
import V18MigrationCliArgument from '../../../scripts/v18-to-v19/V18MigrationCliArgument.ts';
import V18MigrationCliExample from '../../../scripts/v18-to-v19/V18MigrationCliExample.ts';
import V18MigrationCliOutcome from '../../../scripts/v18-to-v19/V18MigrationCliOutcome.ts';
import V18MigrationCliFlag from '../../../scripts/v18-to-v19/V18MigrationCliFlag.ts';
import { formatV18MigrationCliHelp } from '../../../scripts/v18-to-v19/V18MigrationCliHelp.ts';
import {
  isV18MigrationCliHelpRequest,
  parseV18MigrationCliOptions,
} from '../../../scripts/v18-to-v19/V18MigrationCliOptions.ts';
import V18MigrationCliPlaceholder from '../../../scripts/v18-to-v19/V18MigrationCliPlaceholder.ts';
import V18MigrationExecutionMode from '../../../scripts/v18-to-v19/V18MigrationExecutionMode.ts';

const { repository, graph } = V18_MIGRATION_CLI_PLACEHOLDERS;
const EXECUTION_VALUES = new Map([
  [repository, '/srv/data/repo'],
  [graph, 'orders'],
]);
const KNOWN_FAILURES = [
  /^unknown argument: /u,
  /^--[a-z-]+ requires a value$/u,
  /^--[a-z-]+ requires a non-empty value$/u,
  /^--repo and --graph are required\n\nUsage: /u,
  /^--apply cannot be combined with --dry-run$/u,
];

describe('v18 migration CLI contract', () => {
  it('owns every flag name exactly once', () => {
    const names = Object.values(V18_MIGRATION_CLI_FLAGS).flatMap((flag) => flag.names());

    expect(new Set(names).size).toBe(names.length);
    expect(names).toEqual([
      '--repo', '--graph', '--dry-run', '--yes', '--apply', '--json',
      '--recovery-id', '--scratch-root', '-h', '--help',
    ]);
  });

  it('renders the help text only from contract flags and semantics', () => {
    const help = formatV18MigrationCliHelp();

    expect(help.startsWith(
      `Usage: ${V18_MIGRATION_CLI_COMMAND} --repo <path> --graph <graph-name> [options]\n`,
    )).toBe(true);
    for (const flag of Object.values(V18_MIGRATION_CLI_FLAGS)) {
      expect(help).toContain(`  ${flag.synopsis().padEnd(26)}${flag.summary}\n`);
    }
    expect(help).toContain('The default is one pass: discover, confirm, rehearse, promote, and verify.');
    expect(help).toContain('Without --yes, the command requires an interactive terminal');
    expect(help).toContain(
      'With --yes and without --dry-run, it\nmigrates and promotes the named graph without asking.',
    );
    expect(help).toContain('a second guarded transaction rolls those refs back.');
    expect(help).not.toContain('Discovery lists every graph');
    expect(help).toContain(`\n\n${V18_MIGRATION_CLI_SEMANTICS.join('\n')}\n`);
    expect(help.endsWith('\n')).toBe(true);
  });

  it('renders canonical examples with explicit literal and shell placeholders', () => {
    const promote = V18_MIGRATION_CLI_EXAMPLES.get('promote');

    expect(promote?.render('literal')).toBe([
      'npm exec --package=@git-stunts/git-warp@19.1.0 -- git-warp-v18-to-v19 \\',
      '  --repo /path/to/repository \\',
      '  --graph <graph-name>',
    ].join('\n'));
    expect(promote?.render('shell')).toBe([
      'npm exec --package=@git-stunts/git-warp@19.1.0 -- git-warp-v18-to-v19 \\',
      '  --repo "$REPOSITORY" \\',
      '  --graph "$GRAPH_NAME"',
    ].join('\n'));
    expect(V18_MIGRATION_CLI_EXAMPLES.get('automation')?.renderCommand()).toBe(
      'git-warp-v18-to-v19 --repo /path/to/repository --graph <graph-name> --yes',
    );
  });

  it('parses every canonical example into the semantics it documents', () => {
    const parsed = (name: string) => {
      const example = V18_MIGRATION_CLI_EXAMPLES.get(name);
      expect(example).toBeInstanceOf(V18MigrationCliExample);
      return parseV18MigrationCliOptions(example?.argv(EXECUTION_VALUES) ?? []);
    };

    expect(parsed('promote')).toEqual({
      assumeYes: false, graph: 'orders', json: false,
      mode: V18MigrationExecutionMode.promote(), repositoryPath: '/srv/data/repo',
    });
    expect(parsed('dry-run').mode).toBe(V18MigrationExecutionMode.rehearse());
    expect(parsed('dry-run-unattended')).toMatchObject({
      assumeYes: true, mode: V18MigrationExecutionMode.rehearse(),
    });
    expect(parsed('automation')).toMatchObject({ assumeYes: true, json: false });
    expect(parsed('verify-current')).toMatchObject({ assumeYes: true, json: true });
  });

  it('names every documented outcome and its observable exit', () => {
    expect([...V18_MIGRATION_CLI_OUTCOMES.values()].map((outcome) => [
      outcome.name, outcome.stream, outcome.exitCode,
    ])).toEqual([
      ['repository-not-found', 'stderr', 1],
      ['empty-repository', 'stderr', 1],
      ['graph-not-found', 'stderr', 1],
      ['no-terminal', 'stderr', 1],
      ['already-current', 'stdout', 0],
    ]);
  });

  it('documents no outcome through a command form that can promote', () => {
    const modes = [...V18_MIGRATION_CLI_OUTCOMES.values()].map((outcome) => [
      outcome.name,
      parseV18MigrationCliOptions(outcome.example.argv(EXECUTION_VALUES)).mode.promotesVerifiedRefs(),
    ]);

    expect(modes).toHaveLength(5);
    expect(modes.filter(([, promotes]) => promotes !== false)).toEqual([]);
  });

  it('refuses execution values that leave a placeholder unbound', () => {
    const promote = V18_MIGRATION_CLI_EXAMPLES.get('promote');

    expect(() => promote?.argv(new Map([[repository, '/srv/data/repo']]))).toThrow(
      'no execution value for placeholder <graph-name>',
    );
  });

  it('validates flag and placeholder construction', () => {
    expect(() => new V18MigrationCliFlag({ name: 'repo', summary: 'x' })).toThrow(
      'CLI flag name must start with -: repo',
    );
    expect(() => new V18MigrationCliFlag({ name: '--x', summary: '' })).toThrow(
      'CLI flag --x needs a summary',
    );
    expect(() => new V18MigrationCliPlaceholder({ literal: '', shell: '"$X"', synopsis: '<x>' }))
      .toThrow('CLI placeholder forms cannot be empty');
    expect(() => new V18MigrationCliExample('', [])).toThrow('CLI example needs a name');
    expect(() => new V18MigrationCliArgument(V18_MIGRATION_CLI_FLAGS.repo)).toThrow(
      'CLI example argument --repo must match whether the flag takes a value',
    );
    expect(() => new V18MigrationCliArgument(V18_MIGRATION_CLI_FLAGS.yes, graph)).toThrow(
      'CLI example argument --yes must match whether the flag takes a value',
    );
  });
});

describe('v18 migration CLI parser', () => {
  const required = ['--repo', '/srv/data/repo', '--graph', 'orders'];

  it('recognizes help through either contract name', () => {
    expect(isV18MigrationCliHelpRequest(['--graph', 'x', '-h'])).toBe(true);
    expect(isV18MigrationCliHelpRequest(['--help'])).toBe(true);
    expect(isV18MigrationCliHelpRequest(required)).toBe(false);
  });

  it('keeps optional values only when present', () => {
    expect(parseV18MigrationCliOptions([
      ...required, '--recovery-id', 'window-7', '--scratch-root', '/scratch',
    ])).toMatchObject({ recoveryId: 'window-7', scratchRoot: '/scratch' });
  });

  it('rejects unknown flags, missing values, and missing required flags', () => {
    expect(() => parseV18MigrationCliOptions([...required, '--force'])).toThrow(
      'unknown argument: --force',
    );
    expect(() => parseV18MigrationCliOptions([...required, '--help'])).toThrow(
      'unknown argument: --help',
    );
    expect(() => parseV18MigrationCliOptions(['--repo', '--graph', 'orders'])).toThrow(
      '--repo requires a value',
    );
    expect(() => parseV18MigrationCliOptions(['--repo'])).toThrow('--repo requires a value');
    expect(() => parseV18MigrationCliOptions(['--graph', 'orders'])).toThrow(
      `--repo and --graph are required\n\n${formatV18MigrationCliHelp()}`,
    );
  });

  it('refuses an empty value, such as an unset shell variable', () => {
    expect(() => parseV18MigrationCliOptions(['--repo', '', '--graph', 'orders'])).toThrow(
      '--repo requires a non-empty value',
    );
    expect(() => parseV18MigrationCliOptions(['--repo', '/srv/data/repo', '--graph', ''])).toThrow(
      '--graph requires a non-empty value',
    );
    expect(() => parseV18MigrationCliOptions([...required, '--scratch-root', ''])).toThrow(
      '--scratch-root requires a non-empty value',
    );
  });

  it('fails closed with a known refusal for arbitrary flag combinations', () => {
    const token = fc.oneof(
      fc.constantFrom(...Object.values(V18_MIGRATION_CLI_FLAGS).map((flag) => flag.name)),
      fc.constantFrom('/srv/data/repo', 'orders', '--', '-x', '--force', ''),
      fc.string({ maxLength: 6 }),
    );
    fc.assert(fc.property(fc.array(token, { maxLength: 9 }), (args) => {
      const outcome = parseOutcome(args);
      if (outcome instanceof Error) {
        expect(KNOWN_FAILURES.some((pattern) => pattern.test(outcome.message)), outcome.message)
          .toBe(true);
      } else {
        expect(args).toContain('--repo');
        expect(args).toContain('--graph');
        expect(outcome.repositoryPath).not.toBe('');
        expect(outcome.graph).not.toBe('');
        expect(args.includes('--apply') && args.includes('--dry-run')).toBe(false);
        expect(outcome.mode.promotesVerifiedRefs()).toBe(!args.includes('--dry-run'));
      }
    }), { numRuns: 500 });
  });
});

function parseOutcome(args: readonly string[]): ReturnType<typeof parseV18MigrationCliOptions> | Error {
  try {
    return parseV18MigrationCliOptions(args);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return error instanceof Error ? error : new Error(String(error));
  }
}

describe('v18 migration CLI outcome', () => {
  it('requires a non-negative integer exit code', () => {
    const example = V18_MIGRATION_CLI_EXAMPLES.get('automation');
    expect(example).toBeInstanceOf(V18MigrationCliExample);
    const build = (exitCode: number) => () => new V18MigrationCliOutcome({
      example: example ?? new V18MigrationCliExample('fallback', []),
      exitCode,
      name: 'broken',
      stream: 'stderr',
    });

    expect(build(-1)).toThrow('CLI outcome broken needs a non-negative exit code');
    expect(build(1.5)).toThrow('CLI outcome broken needs a non-negative exit code');
  });
});
