import type Evidence from './Evidence.ts';

export type SettlementSourceStatus =
  | 'empty'
  | 'failed'
  | 'ready'
  | 'settled'
  | 'settling';

/**
 * How the target's current basis relates to the strand's base (#1039):
 * `base` when the target has not moved, `footprint-unchanged` when it moved
 * but every node and edge the strand names is unchanged, and
 * `footprint-advanced` when one of them changed.
 */
export type SettlementTargetBasis = 'base' | 'footprint-unchanged' | 'footprint-advanced';

export type SettlementSourceSnapshot = Readonly<{
  readonly baseTargetFrontierRef: string;
  /** Evidence handles of the cone roots the snapshot compared. */
  readonly basisEvidenceRefs: readonly string[];
  readonly frontierRef: string;
  readonly proposalDigest: string;
  readonly status: SettlementSourceStatus;
  readonly targetBasis: SettlementTargetBasis;
  readonly targetFrontierRef: string;
}>;

export type SettlementPromotion = Readonly<{
  readonly accepted: boolean;
  readonly evidence: Evidence | undefined;
  readonly reason: string | undefined;
}>;

export type SettlementSourceExecution = Readonly<{
  readonly capture: () => Promise<SettlementSourceSnapshot>;
  readonly digest: (parts: readonly string[]) => Promise<string>;
  readonly promote: () => Promise<SettlementPromotion>;
}>;

export type SettlementSourceRuntime = Readonly<{
  readonly kind: 'source';
  readonly capture: () => Promise<SettlementSourceSnapshot>;
  readonly digest: (parts: readonly string[]) => Promise<string>;
  readonly runExclusive: <T>(
    operation: (execution: SettlementSourceExecution) => Promise<T>,
  ) => Promise<T>;
}>;

export type SettlementTargetRuntime = Readonly<{
  readonly kind: 'target';
}>;

export type LaneSettlementRuntime =
  | SettlementSourceRuntime
  | SettlementTargetRuntime;
