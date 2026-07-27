import process from 'node:process';
import readline from 'node:readline';

import { usageError } from '../infrastructure.ts';
import { readCliPackageVersion } from '../shared.ts';
import {
  handleMcpMessage,
  mcpParseError,
  type McpResponse,
} from './mcp/McpProtocol.ts';
import McpRuntimeSession from './mcp/McpRuntimeSession.ts';
import type { CliOptions } from '../types.ts';

type McpCommandResult = {
  readonly payload: undefined;
  readonly close: () => Promise<void>;
  readonly completion: Promise<void>;
};

type McpLineTracker = {
  readonly completedFailures: unknown[];
  readonly pending: Set<Promise<void>>;
};

export default function handleMcp({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<McpCommandResult> {
  if (args.length > 0) {
    throw usageError(
      'mcp does not accept positional arguments; use --repo and --writer',
    );
  }
  const session = new McpRuntimeSession({
    at: options.repo,
    writer: options.writer,
  });
  return Promise.resolve(
    createMcpCommandResult(session, readCliPackageVersion()),
  );
}

function createMcpCommandResult(
  session: McpRuntimeSession,
  serverVersion: string,
): McpCommandResult {
  const lines = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });
  const completion = trackMcpLines(
    lines,
    session,
    serverVersion,
  );
  return {
    payload: undefined,
    completion,
    close: async () => {
      lines.close();
      await completion;
      await session.close();
    },
  };
}

function trackMcpLines(
  lines: readline.Interface,
  session: McpRuntimeSession,
  serverVersion: string,
): Promise<void> {
  const pending = new Set<Promise<void>>();
  const completedFailures: unknown[] = [];
  const tracker = { pending, completedFailures };
  const completion = Promise.withResolvers<void>();

  lines.on('line', (line) =>
    trackLine(tracker, dispatchLine(session, serverVersion, line))
  );
  lines.on('error', (error: unknown) =>
    trackInputError(lines, tracker, error)
  );
  lines.once('close', () => {
    void settlePendingDispatches(
      pending,
      completedFailures,
    ).then(completion.resolve, completion.reject);
  });
  return completion.promise;
}

function trackLine(
  tracker: McpLineTracker,
  operation: Promise<void>,
): void {
  tracker.pending.add(operation);
  void operation.then(
    () => tracker.pending.delete(operation),
    (error: unknown) => {
      tracker.pending.delete(operation);
      tracker.completedFailures.push(error);
    },
  );
}

function trackInputError(
  lines: readline.Interface,
  tracker: McpLineTracker,
  error: unknown,
): void {
  tracker.completedFailures.push(error);
  lines.close();
}

async function settlePendingDispatches(
  pending: ReadonlySet<Promise<void>>,
  completedFailures: readonly unknown[],
): Promise<void> {
  const failures = [...completedFailures];
  const results = await Promise.allSettled([...pending]);
  for (const result of results) {
    if (result.status === 'rejected') {
      failures.push(result.reason);
    }
  }
  if (failures.length > 0) {
    throw new AggregateError(
      failures,
      'MCP requests failed while stdin was closing',
    );
  }
}

async function dispatchLine(
  session: McpRuntimeSession,
  serverVersion: string,
  line: string,
): Promise<void> {
  if (line.trim().length === 0) {
    return;
  }
  try {
    const response = await handleMcpMessage(
      session,
      JSON.parse(line),
      { serverVersion },
    );
    if (response !== null) {
      writeResponse(response);
    }
  } catch {
    writeResponse(mcpParseError());
  }
}

function writeResponse(response: McpResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}
