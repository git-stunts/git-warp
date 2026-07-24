import WarpError from '../errors/WarpError.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type Lane from './Lane.ts';

type LaneRuntime = Readonly<{
  readonly captureCoordinate: () => Promise<WarpWorldlineCoordinate>;
}>;

const LANE_RUNTIMES = new WeakMap<Lane, LaneRuntime>();

export function bindLaneRuntime(lane: Lane, runtime: LaneRuntime): void {
  if (LANE_RUNTIMES.has(lane)) {
    throw new WarpError('Lane runtime is already bound', 'E_LANE_RUNTIME_BOUND');
  }
  LANE_RUNTIMES.set(lane, Object.freeze({
    captureCoordinate: runtime.captureCoordinate,
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
