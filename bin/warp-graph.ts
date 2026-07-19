#!/usr/bin/env node

import process from 'node:process';
import { installDefaultRuntimeHostNodePorts } from '../src/application/RuntimeHostNodeDefaults.ts';
import { EXIT_CODES, HELP_TEXT, CliError, parseArgs, usageError } from './cli/infrastructure.ts';
import { stableStringify, compactStringify } from './presenters/json.ts';
import { COMMANDS } from './cli/commands/registry.ts';
import { closeCliStorages } from './cli/shared.ts';

installDefaultRuntimeHostNodePorts();

// Output format must be captured from raw process.argv BEFORE parseArgs() runs.
// If parseArgs() itself throws (e.g., unknown flag, malformed input), the `options`
// object will not exist, so the error handler cannot read `options.json`. By
// pre-scanning argv, the error handler can still emit structured output.
const hasJsonFlag = process.argv.includes('--json');
const hasNdjsonFlag = process.argv.includes('--ndjson');

interface NormalizedCommandResult {
  readonly payload: unknown;
  readonly exitCode: number;
}

/** Runtime guard: does this value carry a `payload` field? */
function hasPayload(value: unknown): value is { payload: unknown; exitCode?: number } {
  return typeof value === 'object' && value !== null && 'payload' in value;
}

/** Runtime guard: does this value carry an async `close` function? */
function hasCloseFn(value: unknown): value is { close: () => Promise<void> } {
  if (typeof value !== 'object' || value === null) { return false; }
  const rec = value as Record<string, unknown>;
  return typeof rec['close'] === 'function';
}

/** Normalizes any handler return shape into { payload, exitCode }. */
function normalizeResult(result: unknown): NormalizedCommandResult {
  if (hasPayload(result)) {
    return {
      payload: result.payload,
      exitCode: typeof result.exitCode === 'number' ? result.exitCode : EXIT_CODES.OK,
    };
  }
  return { payload: result, exitCode: EXIT_CODES.OK };
}

type ParsedInvocation = ReturnType<typeof parseArgs>;

/** Short-circuit the various early-exit conditions (help, removed
 *  flags, mutual exclusion, empty command). Returns true iff the
 *  caller should stop. */
function handleEarlyExits(parsed: ParsedInvocation): boolean {
  const { options, command } = parsed;
  if (options.help) {
    process.stdout.write(HELP_TEXT);
    process.exitCode = EXIT_CODES.OK;
    return true;
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
    return true;
  }
  return false;
}

/** Registers SIGINT/SIGTERM handlers that shut down a long-running
 *  command gracefully. */
function installShutdownHandlers(close: () => Promise<void>): void {
  let closing = false;
  const shutdown = async (): Promise<void> => {
    if (closing) { return; }
    closing = true;
    const results = await Promise.allSettled([close(), closeCliStorages()]);
    const failures = results
      .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (failures.length > 0) {
      throw new AggregateError(failures, 'CLI shutdown failed');
    }
    process.exit(EXIT_CODES.OK);
  };
  process.on('SIGINT', () => { shutdown().catch(() => process.exit(1)); });
  process.on('SIGTERM', () => { shutdown().catch(() => process.exit(1)); });
}

/** Writes the payload (when present) in the requested stringify
 *  format. */
function emitPayload(payload: unknown, ndjson: boolean): void {
  if (payload === undefined) { return; }
  const stringify = ndjson ? compactStringify : stableStringify;
  process.stdout.write(`${stringify(payload)}\n`);
}

/**
 * CLI entry point. Parses arguments, dispatches to the appropriate command handler,
 * and emits the result to stdout (JSON or human-readable).
 */
async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if (handleEarlyExits(parsed)) { return; }

  const { options, command, commandArgs } = parsed;
  // handleEarlyExits already returned for empty/undefined commands.
  // Re-narrow here for the compiler since early-exit propagation
  // doesn't survive the function boundary.
  if (command === undefined || command === '') { return; }

  const handler = COMMANDS.get(command);
  if (!handler) {
    throw usageError(`Unknown command: ${command}`);
  }

  const result = await handler({ args: commandArgs, options });
  const normalized = normalizeResult(result);
  emitPayload(normalized.payload, options.ndjson);

  // Long-running commands may return a `close` function.
  // Wait for SIGINT/SIGTERM instead of exiting immediately.
  if (hasCloseFn(result)) {
    installShutdownHandlers(result.close);
    return; // Keep the process alive
  }

  await closeCliStorages();
  process.exit(normalized.exitCode);
}

main().catch(async (caught: unknown) => {
  let error = caught;
  try {
    await closeCliStorages();
  } catch (closeError) {
    error = new AggregateError([caught, closeError], 'CLI command and storage cleanup failed');
  }
  const exitCode = error instanceof CliError ? error.exitCode : EXIT_CODES.INTERNAL;
  const code = error instanceof CliError ? error.code : 'E_INTERNAL';
  const message = error instanceof Error ? error.message : 'Unknown error';
  const payload: { error: { code: string; message: string; cause?: unknown } } = { error: { code, message } };

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
