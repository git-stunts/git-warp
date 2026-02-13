#!/usr/bin/env node

import process from 'node:process';
import { EXIT_CODES, HELP_TEXT, CliError, parseArgs, usageError } from './cli/infrastructure.js';
import { present } from './presenters/index.js';
import { stableStringify, compactStringify } from './presenters/json.js';
import { renderError } from './presenters/text.js';
import { COMMANDS } from './cli/commands/registry.js';

const VIEW_SUPPORTED_COMMANDS = ['info', 'check', 'history', 'path', 'materialize', 'query', 'seek'];

/**
 * CLI entry point. Parses arguments, dispatches to the appropriate command handler,
 * and emits the result to stdout (JSON or human-readable).
 * @returns {Promise<void>}
 */
async function main() {
  const { options, command, commandArgs } = parseArgs(process.argv.slice(2));

  if (options.help) {
    process.stdout.write(HELP_TEXT);
    process.exitCode = EXIT_CODES.OK;
    return;
  }

  if (options.json && options.view) {
    throw usageError('--json and --view are mutually exclusive');
  }
  if (options.ndjson && options.view) {
    throw usageError('--ndjson and --view are mutually exclusive');
  }
  if (options.json && options.ndjson) {
    throw usageError('--json and --ndjson are mutually exclusive');
  }

  if (!command) {
    process.stderr.write(HELP_TEXT);
    process.exitCode = EXIT_CODES.USAGE;
    return;
  }

  const handler = COMMANDS.get(command);
  if (!handler) {
    throw usageError(`Unknown command: ${command}`);
  }

  if (options.view && !VIEW_SUPPORTED_COMMANDS.includes(command)) {
    throw usageError(`--view is not supported for '${command}'. Supported commands: ${VIEW_SUPPORTED_COMMANDS.join(', ')}`);
  }

  const result = await /** @type {Function} */ (handler)({
    command,
    args: commandArgs,
    options,
  });

  /** @type {{payload: *, exitCode: number}} */
  const normalized = result && typeof result === 'object' && 'payload' in result
    ? result
    : { payload: result, exitCode: EXIT_CODES.OK };

  if (normalized.payload !== undefined) {
    const format = options.ndjson ? 'ndjson' : options.json ? 'json' : 'text';
    present(normalized.payload, { format, command, view: options.view });
  }
  // Use process.exit() to avoid waiting for fire-and-forget I/O (e.g. seek cache writes).
  process.exit(normalized.exitCode ?? EXIT_CODES.OK);
}

main().catch((error) => {
  const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.INTERNAL;
  const code = error instanceof CliError ? error.code : 'E_INTERNAL';
  const message = error instanceof Error ? error.message : 'Unknown error';
  /** @type {{error: {code: string, message: string, cause?: *}}} */
  const payload = { error: { code, message } };

  if (error && error.cause) {
    payload.error.cause = error.cause instanceof Error ? error.cause.message : error.cause;
  }

  if (process.argv.includes('--json') || process.argv.includes('--ndjson')) {
    const stringify = process.argv.includes('--ndjson') ? compactStringify : stableStringify;
    process.stdout.write(`${stringify(payload)}\n`);
  } else {
    process.stderr.write(renderError(payload));
  }
  process.exit(exitCode);
});
