import { readFileSync } from 'node:fs';
import { z } from 'zod';

import {
  parseCommandArgs,
  usageError,
  usageErrorFrom,
} from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { parseMcpJson } from '../../presenters/V19Json.ts';
import { renderReceipt } from '../../presenters/V19ReadingReceipt.ts';
import type { McpJsonValue } from './mcp/McpJsonValue.ts';

const RECEIPT_OPTIONS = {
  input: { type: 'string' },
};

const RECEIPT_SCHEMA = z.object({
  input: z.string().min(1),
});

export default async function handleReceipt({
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<{
  readonly payload: McpJsonValue;
  readonly human: string;
}> {
  return await Promise.resolve(receiptResult(args));
}

function receiptResult(args: readonly string[]): {
  readonly payload: McpJsonValue;
  readonly human: string;
} {
  const inputPath = receiptInputPath(args);
  try {
    const text = readFileSync(inputPath === '-' ? 0 : inputPath, 'utf8');
    const payload = parseMcpJson(JSON.parse(text));
    return { payload, human: renderReceipt(payload) };
  } catch (error) {
    throw usageErrorFrom(`Unable to read Receipt from ${inputPath}`, error);
  }
}

function receiptInputPath(args: readonly string[]): string {
  const { values, positionals } = parseCommandArgs(
    args,
    RECEIPT_OPTIONS,
    RECEIPT_SCHEMA,
    { allowPositionals: true },
  );
  if (positionals.length !== 1 || positionals[0] !== 'show') {
    throw usageError('Usage: git warp receipt show --input <path|->');
  }
  return values.input;
}
