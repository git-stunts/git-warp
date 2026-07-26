import WarpError from '../errors/WarpError.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type Lane from './Lane.ts';
import type { LaneSettlementRuntime } from './LaneSettlementRuntime.ts';

export type LaneRuntime = Readonly<{
  readonly captureCoordinate: () => Promise<WarpWorldlineCoordinate>;
  readonly fork: ((name: string) => Promise<Lane>) | null;
  readonly owner: object;
  readonly settlement: LaneSettlementRuntime;
}>;

const LANE_RUNTIMES = new WeakMap<Lane, LaneRuntime>();

export function bindLaneRuntime(lane: Lane, runtime: LaneRuntime): void {
  if (LANE_RUNTIMES.has(lane)) {
    throw new WarpError('Lane runtime is already bound', 'E_LANE_RUNTIME_BOUND');
  }
  LANE_RUNTIMES.set(lane, Object.freeze({
    captureCoordinate: runtime.captureCoordinate,
    fork: runtime.fork,
    owner: runtime.owner,
    settlement: runtime.settlement,
  }));
}

export function requireLaneRuntime(lane: Lane): LaneRuntime {
  const runtime = LANE_RUNTIMES.get(lane);
  if (runtime === undefined) {
    throw new WarpError(
      'Lane was not opened by a Runtime',
      'E_LANE_RUNTIME_UNAVAILABLE',
    );
  }
  return runtime;
}
