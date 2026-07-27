import path from 'node:path';
import process from 'node:process';
import {
  parseArgs as nodeParseArgs,
  type ParseArgsConfig,
} from 'node:util';
import type { ZodType, ZodTypeDef } from 'zod';

import { V19_CAPABILITY_CONTRACT } from './capabilities/V19CapabilityContract.generated.ts';
import type { CliOptions } from './types.ts';

export const EXIT_CODES = {
  OK: 0,
  USAGE: 1,
  NOT_FOUND: 2,
  INTERNAL: 3,
  TRUST_FAIL: 4,
  NO_MATCH: 1,
};

export function getEnvVar(name: string): string | undefined {
  return process.env[name];
}

export const HELP_TEXT = [
  'git warp <command> [options]',
  '',
  'v19 commands:',
  ...V19_CAPABILITY_CONTRACT.cli.flatMap((capability) => [
    `  ${capability.command.padEnd(10)} ${capability.summary}`,
    `               ${capability.usage}`,
  ]),
  '',
  'options:',
  '  --repo <path>     Local Git repository (default: cwd)',
  '  --lane <name>     Runtime Lane name',
  '  --strand <name>   Named child strand of --lane',
  '  --writer <id>     Runtime writer identity (default: cli)',
  '  --json            Emit one canonical JSON envelope',
  '  --jsonl           Emit canonical JSON Lines for streaming output',
  '  -h, --help        Show this help',
  '',
].join('\n');

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  override readonly cause: Error | undefined;

  constructor(
    message: string,
    options: {
      readonly code?: string;
      readonly exitCode?: number;
      readonly cause?: Error;
    } = {},
  ) {
    super(message);
    this.code = options.code ?? 'E_CLI';
    this.exitCode = options.exitCode ?? EXIT_CODES.INTERNAL;
    this.cause = options.cause;
  }
}

export function usageError(message: string): CliError {
  return new CliError(message, {
    code: 'E_USAGE',
    exitCode: EXIT_CODES.USAGE,
  });
}

export function usageErrorFrom(context: string, error: unknown): CliError {
  if (error instanceof CliError && error.code === 'E_USAGE') {
    return error;
  }
  const cause = error instanceof Error
    ? error
    : new CliError(String(error));
  return new CliError(`${context}: ${cause.message}`, {
    code: 'E_USAGE',
    exitCode: EXIT_CODES.USAGE,
    cause,
  });
}

export function notFoundError(message: string): CliError {
  return new CliError(message, {
    code: 'E_NOT_FOUND',
    exitCode: EXIT_CODES.NOT_FOUND,
  });
}

export const KNOWN_COMMANDS = Object.freeze(
  V19_CAPABILITY_CONTRACT.cli.map((capability) => capability.command),
);

const BASE_OPTIONS = {
  repo: { type: 'string', short: 'r' },
  lane: { type: 'string' },
  strand: { type: 'string' },
  writer: { type: 'string', default: 'cli' },
  json: { type: 'boolean', default: false },
  jsonl: { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
} as const;

const BASE_STRING_FLAGS = new Set([
  '--repo',
  '-r',
  '--lane',
  '--strand',
  '--writer',
]);
const BASE_BOOLEAN_FLAGS = new Set([
  '--json',
  '--jsonl',
  '--help',
  '-h',
]);

type ExtractedArgs = {
  readonly baseArgs: string[];
  readonly command: string | undefined;
  readonly commandArgs: string[];
};

function extractBaseArgs(argv: readonly string[]): ExtractedArgs {
  const baseArgs: string[] = [];
  const commandArgs: string[] = [];
  let command: string | undefined;
  let commandSeen = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) {
      continue;
    }
    if (argument === '--') {
      commandArgs.push(...argv.slice(index + 1));
      break;
    }
    if (BASE_STRING_FLAGS.has(argument)) {
      baseArgs.push(argument);
      const value = argv[index + 1];
      if (value !== undefined) {
        baseArgs.push(value);
        index += 1;
      }
      continue;
    }
    const baseName = argument.split('=', 1)[0];
    if (
      argument.startsWith('--')
      && baseName !== undefined
      && BASE_STRING_FLAGS.has(baseName)
    ) {
      baseArgs.push(argument);
      continue;
    }
    if (BASE_BOOLEAN_FLAGS.has(argument)) {
      baseArgs.push(argument);
      continue;
    }
    if (!commandSeen && !argument.startsWith('-')) {
      command = argument;
      commandSeen = true;
      continue;
    }
    commandArgs.push(argument);
  }
  return { baseArgs, command, commandArgs };
}

export function parseArgs(
  argv: readonly string[],
): {
  readonly options: CliOptions;
  readonly command: string | undefined;
  readonly commandArgs: string[];
} {
  const { baseArgs, command, commandArgs } = extractBaseArgs(argv);
  let values: {
    readonly repo?: string;
    readonly lane?: string;
    readonly strand?: string;
    readonly writer?: string;
    readonly json?: boolean;
    readonly jsonl?: boolean;
    readonly help?: boolean;
  };
  try {
    values = nodeParseArgs({
      args: baseArgs,
      options: BASE_OPTIONS,
      strict: true,
      allowPositionals: false,
    }).values;
  } catch (error) {
    throw usageError(error instanceof Error ? error.message : String(error));
  }
  const lane = typeof values.lane === 'string' ? values.lane : null;
  const strand = typeof values.strand === 'string' ? values.strand : null;
  const jsonl = values.jsonl === true;
  const writerExplicit = baseArgs.some(
    (argument) =>
      argument === '--writer' || argument.startsWith('--writer='),
  );
  const options: CliOptions = {
    repo: path.resolve(
      typeof values.repo === 'string' ? values.repo : process.cwd(),
    ),
    lane,
    strand,
    writer: typeof values.writer === 'string' ? values.writer : 'cli',
    json: values.json === true,
    jsonl,
    help: values.help === true,
    writerExplicit,
  };
  return { options, command, commandArgs };
}

export function parseCommandArgs<T>(
  args: readonly string[],
  config: Record<
    string,
    {
      readonly type: string;
      readonly short?: string;
      readonly default?: unknown;
      readonly multiple?: boolean;
    }
  >,
  schema: ZodType<T, ZodTypeDef, unknown>,
  {
    allowPositionals = false,
  }: { readonly allowPositionals?: boolean } = {},
): { readonly values: T; readonly positionals: string[] } {
  let parsed: {
    readonly values: Record<
      string,
      string | boolean | string[] | boolean[] | undefined
    >;
    readonly positionals: string[];
  };
  try {
    parsed = nodeParseArgs({
      args,
      options: config as ParseArgsConfig['options'],
      strict: true,
      allowPositionals,
    });
  } catch (error) {
    throw usageError(error instanceof Error ? error.message : String(error));
  }
  const validated = schema.safeParse(parsed.values);
  if (!validated.success) {
    throw usageError(
      validated.error.issues
        .map((issue) => issue.message)
        .join('; '),
    );
  }
  return {
    values: validated.data,
    positionals: parsed.positionals,
  };
}
