import type Lane from '../domain/api/Lane.ts';

export type RuntimeSettlementOptions = Readonly<{
  readonly source: Lane;
  readonly target: Lane;
}>;
