import process from 'node:process';
import readline from 'node:readline';

import { usageError } from '../infrastructure.ts';
import { openGraph, readCliPackageVersion } from '../shared.ts';
import {
  handleMcpMessage,
  mcpParseError,
  type McpResponse,
} from './mcp/McpProtocol.ts';
import type { CliOptions } from '../types.ts';

type McpCommandResult = {
  readonly payload: undefined;
  readonly close: () => Promise<void>;
  readonly completion: Promise<void>;
};

function writeResponse(response: McpResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

/** Handles `git warp mcp`: starts a local stdio MCP server. */
export default async function handleMcp({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<McpCommandResult> {
  if (args.length > 0) {
    throw usageError('mcp does not accept positional args; use --repo, --graph, and --writer');
  }

  const { graph } = await openGraph(options);
  return createMcpCommandResult(graph, readCliPackageVersion());
}

function createMcpCommandResult(
  graph: Parameters<typeof handleMcpMessage>[0],
  serverVersion: string,
): McpCommandResult {
  const lines = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });
  const completion = trackMcpLines(lines, graph, serverVersion);

  return {
    payload: undefined,
    completion,
    close: async () => {
      lines.close();
      await completion;
    },
  };
}

function trackMcpLines(
  lines: readline.Interface,
  graph: Parameters<typeof handleMcpMessage>[0],
  serverVersion: string,
): Promise<void> {
  const pending = new Set<Promise<void>>();
  const completedFailures: unknown[] = [];
  const completion = Promise.withResolvers<void>();

  lines.on('line', (line) => {
    const operation = dispatchLine(graph, serverVersion, line);
    pending.add(operation);
    void operation.then(
      () => pending.delete(operation),
      (error: unknown) => {
        pending.delete(operation);
        completedFailures.push(error);
      },
    );
  });
  lines.once('close', () => {
    void settlePendingDispatches(pending, completedFailures)
      .then(completion.resolve, completion.reject);
  });
  return completion.promise;
}

async function settlePendingDispatches(
  pending: ReadonlySet<Promise<void>>,
  completedFailures: readonly unknown[],
): Promise<void> {
  const failures = [...completedFailures];
  const results = await Promise.allSettled([...pending]);
  failures.push(...results
    .filter((result): result is PromiseRejectedResult => result.status === 'rejected')
    .map((result) => result.reason as unknown));
  if (failures.length > 0) {
    throw new AggregateError(failures, 'MCP requests failed while stdin was closing');
  }
}

async function dispatchLine(
  graph: Parameters<typeof handleMcpMessage>[0],
  serverVersion: string,
  line: string,
): Promise<void> {
  if (line.trim().length === 0) {
    return;
  }
  try {
    const parsed = JSON.parse(line) as unknown;
    const response = await handleMcpMessage(graph, parsed, { serverVersion });
    if (response !== null) {
      writeResponse(response);
    }
  } catch {
    writeResponse(mcpParseError());
  }
}
