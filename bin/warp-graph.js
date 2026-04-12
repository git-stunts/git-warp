#!/usr/bin/env node

import process from 'node:process';
import { EXIT_CODES, HELP_TEXT, CliError, parseArgs, usageError } from './cli/infrastructure.js';
import { stableStringify, compactStringify } from './presenters/json.js';
import { COMMANDS } from './cli/commands/registry.js';

// Output format must be captured from raw process.argv BEFORE parseArgs() runs.
// If parseArgs() itself throws (e.g., unknown flag, malformed input), the `options`
// object will not exist, so the error handler cannot read `options.json`. By
// pre-scanning argv, the error handler can still emit structured output.
const hasJsonFlag = process.argv.includes('--json');
const hasNdjsonFlag = process.argv.includes('--ndjson');

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

  if (options.view !== null && options.view !== '') {
    throw usageError('--view has been removed. Use warp-ttd for visualization.');
  }
  if (options.json && options.ndjson) {
    throw usageError('--json and --ndjson are mutually exclusive');
  }

  if (command === undefined || command === '') {
    process.stderr.write(HELP_TEXT);
    process.exitCode = EXIT_CODES.USAGE;
    return;
  }

  const handler = COMMANDS.get(command);
  if (!handler) {
    throw usageError(`Unknown command: ${command}`);
  }

  /** @type {(opts: {command: string, args: string[], options: Record<string, unknown>}) => Promise<unknown>} */
  const typedHandler = /** @type {(opts: {command: string, args: string[], options: Record<string, unknown>}) => Promise<unknown>} */ (handler);
  const result = await typedHandler({
    command,
    args: commandArgs,
    options,
  });

  /** @type {{payload: unknown, exitCode: number}} */
  const normalized = result !== null && result !== undefined && typeof result === 'object' && 'payload' in /** @type {Record<string, unknown>} */ (result)
    ? /** @type {{payload: unknown, exitCode: number}} */ (result)
    : { payload: result, exitCode: EXIT_CODES.OK };

  if (normalized.payload !== undefined) {
    const stringify = options.ndjson ? compactStringify : stableStringify;
    process.stdout.write(`${stringify(normalized.payload)}\n`);
  }

  // Long-running commands may return a `close` function.
  // Wait for SIGINT/SIGTERM instead of exiting immediately.
  const close = result !== null && result !== undefined && typeof result === 'object' && 'close' in /** @type {Record<string, unknown>} */ (result)
    // eslint-disable-next-line @typescript-eslint/dot-notation -- Record<string,unknown> requires bracket access (TS4111)
    ? /** @type {() => Promise<void>} */ (/** @type {Record<string, unknown>} */ (result)['close'])
    : null;

  if (close) {
    let closing = false;
    /** Gracefully shuts down long-running commands on signal. */
    const shutdown = async () => {
      if (closing) { return; }
      closing = true;
      await close();
      process.exit(EXIT_CODES.OK);
    };
    process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
    process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
    return; // Keep the process alive
  }

  // Use process.exit() to avoid waiting for fire-and-forget I/O (e.g. seek cache writes).
  process.exit(normalized.exitCode ?? EXIT_CODES.OK);
}

main().catch((/** @type {unknown} */ error) => {
  const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.INTERNAL;
  const code = error instanceof CliError ? error.code : 'E_INTERNAL';
  const message = error instanceof Error ? error.message : 'Unknown error';
  /** @type {{error: {code: string, message: string, cause?: unknown}}} */
  const payload = { error: { code, message } };

  if (error instanceof Error && error.cause !== undefined) {
    payload.error.cause = error.cause instanceof Error ? error.cause.message : error.cause;
  }

  if (hasJsonFlag || hasNdjsonFlag) {
    const stringify = hasNdjsonFlag ? compactStringify : stableStringify;
    process.stdout.write(`${stringify(payload)}\n`);
  } else {
    process.stderr.write(`Error: ${payload.error.message}\n`);
  }
  process.exit(exitCode);
});
