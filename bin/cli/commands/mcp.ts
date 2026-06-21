import fs from 'node:fs';
import process from 'node:process';
import readline from 'node:readline';

import { usageError } from '../infrastructure.ts';
import { openGraph } from '../shared.ts';
import {
  handleMcpMessage,
  mcpParseError,
  type McpResponse,
} from './mcp/McpProtocol.ts';
import type { CliOptions } from '../types.ts';

type McpCommandResult = {
  readonly payload: undefined;
  readonly close: () => Promise<void>;
};

function readPackageVersion(): string {
  const packageUrl = new URL('../../../package.json', import.meta.url);
  const packageText = fs.readFileSync(packageUrl, 'utf8');
  const packageJson = JSON.parse(packageText) as { readonly version?: string };
  return typeof packageJson.version === 'string' && packageJson.version.length > 0
    ? packageJson.version
    : '0.0.0';
}

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
  const serverVersion = readPackageVersion();
  const lines = readline.createInterface({
    input: process.stdin,
    terminal: false,
  });

  lines.on('line', (line) => {
    void dispatchLine(graph, serverVersion, line);
  });

  return {
    payload: undefined,
    close: () => {
      lines.close();
      return Promise.resolve();
    },
  };
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
