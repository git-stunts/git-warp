import type Evidence from './Evidence.ts';

export type SettlementSourceStatus =
  | 'empty'
  | 'failed'
  | 'ready'
  | 'settled'
  | 'settling';

export type SettlementSourceSnapshot = Readonly<{
  readonly baseTargetFrontierRef: string;
  readonly frontierRef: string;
  readonly proposalDigest: string;
  readonly status: SettlementSourceStatus;
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
