import type { AdmissionOutcome } from './AdmissionOutcome.ts';
import type Evidence from './Evidence.ts';
import type { LaneReference } from './Lane.ts';
import type {
  SettlementSourceRuntime,
  SettlementSourceSnapshot,
} from './LaneSettlementRuntime.ts';
import SettlementPlan from '../settlement/SettlementPlan.ts';
import WarpError from '../errors/WarpError.ts';

export type SettlementPlanBinding = Readonly<{
  readonly evidence: Evidence;
  readonly outcome: AdmissionOutcome;
  readonly owner: object;
  readonly source: LaneReference;
  readonly sourceRuntime: SettlementSourceRuntime;
  readonly sourceSnapshot: SettlementSourceSnapshot;
  readonly target: LaneReference;
}>;

const PLAN_BINDINGS = new WeakMap<SettlementPlan, SettlementPlanBinding>();

export function bindSettlementPlan(
  plan: SettlementPlan,
  binding: SettlementPlanBinding,
): void {
  if (PLAN_BINDINGS.has(plan)) {
    throw new WarpError(
      'SettlementPlan runtime is already bound',
      'E_SETTLEMENT_PLAN_BOUND',
    );
  }
  PLAN_BINDINGS.set(plan, Object.freeze({ ...binding }));
}

export function requireSettlementPlanBinding(
  plan: SettlementPlan,
): SettlementPlanBinding {
  if (!(plan instanceof SettlementPlan)) {
    throw new WarpError(
      'Runtime.settle requires a SettlementPlan',
      'E_RUNTIME_SETTLEMENT_PLAN',
    );
  }
  const binding = PLAN_BINDINGS.get(plan);
  if (binding === undefined) {
    throw new WarpError(
      'Runtime.settle requires a runtime-issued SettlementPlan',
      'E_RUNTIME_SETTLEMENT_PLAN',
    );
  }
  return binding;
}
