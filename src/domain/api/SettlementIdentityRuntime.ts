import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import { compareStrings } from '../utils/StringComparison.ts';

export type SettlementFrontierEntry = Readonly<{
  readonly patchSha: string;
  readonly writerId: string;
}>;

type SettlementFrontierOptions = Readonly<{
  readonly checkpointSha: string;
  readonly context: ApiRuntimeContext;
  readonly entries: readonly SettlementFrontierEntry[];
  readonly worldlineName: string;
}>;

type SettlementSourceFrontierOptions = SettlementFrontierOptions & Readonly<{
  readonly strandName: string;
}>;

export async function createSettlementFrontierRef(
  options: SettlementFrontierOptions,
): Promise<string> {
  return await options.context.createOpaqueId('admission', [
    'settlement-frontier',
    options.worldlineName,
    options.checkpointSha,
    ...flattenFrontier(options.entries),
  ]);
}

export async function createSettlementSourceFrontierRef(
  options: SettlementSourceFrontierOptions,
): Promise<string> {
  return await options.context.createOpaqueId('admission', [
    'settlement-source-frontier',
    options.worldlineName,
    options.strandName,
    options.checkpointSha,
    ...flattenFrontier(options.entries),
  ]);
}

export async function createSettlementDigest(
  context: ApiRuntimeContext,
  parts: readonly string[],
): Promise<string> {
  return await context.createOpaqueId('admission', [
    'settlement',
    ...parts,
  ]);
}

function flattenFrontier(
  entries: readonly SettlementFrontierEntry[],
): readonly string[] {
  return entries
    .slice()
    .sort((left, right) => compareStrings(left.writerId, right.writerId))
    .flatMap(({ writerId, patchSha }) => [writerId, patchSha]);
}
