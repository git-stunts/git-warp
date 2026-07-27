import { readFileSync } from 'node:fs';

import { usageError } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { parseMcpJson } from '../../presenters/V19Json.ts';
import { renderReceipt } from '../../presenters/V19ReadingReceipt.ts';
import type { McpJsonValue } from './mcp/McpJsonValue.ts';

export default function handleReceipt({
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<{
  readonly payload: McpJsonValue;
  readonly human: string;
}> {
  return Promise.resolve(receiptResult(args));
}

function receiptResult(args: readonly string[]): {
  readonly payload: McpJsonValue;
  readonly human: string;
} {
  const inputPath = receiptInputPath(args);
  const text = readFileSync(inputPath === '-' ? 0 : inputPath, 'utf8');
  const payload = parseMcpJson(JSON.parse(text));
  return { payload, human: renderReceipt(payload) };
}

function receiptInputPath(args: readonly string[]): string {
  const [subcommand, inputFlag, inputPath, ...rest] = args;
  if (
    subcommand !== 'show'
    || inputFlag !== '--input'
    || inputPath === undefined
    || rest.length > 0
  ) {
    throw usageError('Usage: git warp receipt show --input <path|->');
  }
  return inputPath;
}
