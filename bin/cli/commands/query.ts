import { EXIT_CODES, usageError, parseCommandArgs } from '../infrastructure.ts';
import { openGraph, applyCursorCeiling, emitCursorWarning } from '../shared.ts';
import { querySchema } from '../schemas.ts';
import type { CliOptions } from '../types.ts';
import type QueryBuilder from '../../../src/domain/services/query/QueryBuilder.ts';
import type { QueryResult } from '../../../src/domain/services/query/QueryRunner.ts';

const QUERY_OPTIONS = {
  match: { type: 'string' },
  outgoing: { type: 'string', multiple: true },
  incoming: { type: 'string', multiple: true },
  'where-prop': { type: 'string', multiple: true },
  select: { type: 'string' },
};

type QueryOperationToken =
  | { readonly kind: 'outgoing'; readonly value: string }
  | { readonly kind: 'incoming'; readonly value: string }
  | { readonly kind: 'where-prop'; readonly value: string };

type QueryCommandResult = {
  readonly payload: QueryResult & { readonly graph: string };
  readonly exitCode: number;
};

type QueryTokenSpec = {
  readonly flag: string;
  readonly kind: QueryOperationToken['kind'];
};

type QueryTokenReadResult = {
  readonly token: QueryOperationToken | null;
  readonly consumedNext: boolean;
};

type QueryValues = {
  readonly match: string | null;
  readonly select: string | undefined;
};

const QUERY_TOKEN_SPECS: readonly QueryTokenSpec[] = [
  { flag: '--outgoing', kind: 'outgoing' },
  { flag: '--incoming', kind: 'incoming' },
  { flag: '--where-prop', kind: 'where-prop' },
];

function readFlagValue(args: readonly string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined || value.length === 0 || value.startsWith('--')) {
    throw usageError(`Missing value for ${flag}`);
  }
  return value;
}

function readInlineFlagValue(arg: string, flag: string): string {
  const value = arg.slice(`${flag}=`.length);
  if (value.length === 0) {
    throw usageError(`Missing value for ${flag}`);
  }
  return value;
}

function splitWhereProp(raw: string): { readonly key: string; readonly value: string } {
  const equalsIndex = raw.indexOf('=');
  if (equalsIndex <= 0) {
    throw usageError(`Invalid --where-prop value: ${raw}. Expected key=value.`);
  }
  const key = raw.slice(0, equalsIndex);
  const value = raw.slice(equalsIndex + 1);
  return { key, value };
}

function isValueFlag(arg: string): boolean {
  return arg === '--match' || arg === '--select';
}

function inlineSpec(arg: string): QueryTokenSpec | undefined {
  return QUERY_TOKEN_SPECS.find((spec) => arg.startsWith(`${spec.flag}=`));
}

function bareSpec(arg: string): QueryTokenSpec | undefined {
  return QUERY_TOKEN_SPECS.find((spec) => arg === spec.flag);
}

function readTokenAt(args: readonly string[], index: number): QueryTokenReadResult {
  const arg = args[index];
  if (arg === undefined) {
    return { token: null, consumedNext: false };
  }
  const inline = inlineSpec(arg);
  if (inline !== undefined) {
    return { token: { kind: inline.kind, value: readInlineFlagValue(arg, inline.flag) }, consumedNext: false };
  }
  const bare = bareSpec(arg);
  if (bare !== undefined) {
    return { token: { kind: bare.kind, value: readFlagValue(args, index, bare.flag) }, consumedNext: true };
  }
  return { token: null, consumedNext: isValueFlag(arg) };
}

function queryOperationTokens(args: readonly string[]): QueryOperationToken[] {
  const operations: QueryOperationToken[] = [];
  for (let i = 0; i < args.length; i++) {
    const result = readTokenAt(args, i);
    if (result.token !== null) {
      operations.push(result.token);
    }
    if (result.consumedNext) {
      i++;
    }
  }
  return operations;
}

function applyWhereProp(builder: QueryBuilder, raw: string): QueryBuilder {
  const { key, value } = splitWhereProp(raw);
  return builder.where({ [key]: value });
}

function selectFields(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  return raw.split(',').map((field) => field.trim()).filter((field) => field.length > 0);
}

function assertQueryResult(result: Awaited<ReturnType<QueryBuilder['run']>>): QueryResult {
  if ('nodes' in result) {
    return result;
  }
  throw usageError('query command does not support aggregate result output');
}

function applyToken(builder: QueryBuilder, token: QueryOperationToken): QueryBuilder {
  if (token.kind === 'outgoing') {
    return builder.outgoing(token.value);
  }
  if (token.kind === 'incoming') {
    return builder.incoming(token.value);
  }
  return applyWhereProp(builder, token.value);
}

function applySelect(builder: QueryBuilder, raw: string | undefined): QueryBuilder {
  const fields = selectFields(raw);
  return fields !== undefined ? builder.select(fields) : builder;
}

function buildQueryBuilder(base: QueryBuilder, values: QueryValues, args: readonly string[]): QueryBuilder {
  let builder = values.match !== null ? base.match(values.match) : base;
  for (const token of queryOperationTokens(args)) {
    builder = applyToken(builder, token);
  }
  return applySelect(builder, values.select);
}

/** Handles `git warp query`: runs the public query builder from the CLI. */
export default async function handleQuery({ options, args }: { options: CliOptions; args: string[] }): Promise<QueryCommandResult> {
  const { values } = parseCommandArgs(args, QUERY_OPTIONS, querySchema);
  const { graph, graphName, persistence } = await openGraph(options);
  const cursorInfo = await applyCursorCeiling(graph, persistence, graphName);
  emitCursorWarning(cursorInfo, null);
  await graph.materialize();

  const builder = buildQueryBuilder(graph.query(), values, args);
  const result = assertQueryResult(await builder.run());
  return {
    payload: { graph: graphName, ...result },
    exitCode: EXIT_CODES.OK,
  };
}
