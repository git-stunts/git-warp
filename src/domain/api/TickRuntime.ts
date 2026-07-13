import type WarpWorldline from '../WarpWorldline.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import WarpError from '../errors/WarpError.ts';
import Tick from './Tick.ts';

type TickBinding = {
  readonly coordinate: WarpWorldlineCoordinate;
  readonly runtime: WarpWorldline;
};

const tickBindings = new WeakMap<Tick, TickBinding>();

export async function createTick(runtime: WarpWorldline): Promise<Tick> {
  await runtime.prepareOpticBasis();
  const coordinate = await runtime.coordinate();
  const tick = new Tick({
    timeline: runtime.worldlineName,
    id: tickId(coordinate),
  });
  tickBindings.set(tick, { coordinate, runtime });
  return tick;
}

export function requireTickCoordinate(runtime: WarpWorldline, tick: Tick): WarpWorldlineCoordinate {
  const binding = tickBindings.get(tick);
  if (
    binding === undefined ||
    binding.runtime !== runtime ||
    tick.timeline !== runtime.worldlineName
  ) {
    throw new WarpError('Tick does not belong to this Timeline', 'E_TIMELINE_TICK_MISMATCH');
  }
  return binding.coordinate;
}

function tickId(coordinate: WarpWorldlineCoordinate): string {
  const frontier = coordinate.frontierEntries
    .map((entry) => `${encodeURIComponent(entry.writerId)}=${entry.patchSha}`)
    .join(',');
  return `tick:${coordinate.checkpointSha}:${frontier}`;
}
