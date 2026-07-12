import type WarpWorldline from '../WarpWorldline.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import WarpError from '../errors/WarpError.ts';
import Tick from './Tick.ts';

const tickCoordinates = new WeakMap<Tick, WarpWorldlineCoordinate>();

export async function createTick(runtime: WarpWorldline): Promise<Tick> {
  await runtime.prepareOpticBasis();
  const coordinate = await runtime.coordinate();
  const tick = new Tick({
    timeline: runtime.worldlineName,
    id: tickId(coordinate),
  });
  tickCoordinates.set(tick, coordinate);
  return tick;
}

export function requireTickCoordinate(runtime: WarpWorldline, tick: Tick): WarpWorldlineCoordinate {
  const coordinate = tickCoordinates.get(tick);
  if (coordinate === undefined || tick.timeline !== runtime.worldlineName) {
    throw new WarpError('Tick does not belong to this Timeline', 'E_TIMELINE_TICK_MISMATCH');
  }
  return coordinate;
}

function tickId(coordinate: WarpWorldlineCoordinate): string {
  const frontier = coordinate.frontierEntries
    .map((entry) => `${encodeURIComponent(entry.writerId)}=${entry.patchSha}`)
    .join(',');
  return `tick:${coordinate.checkpointSha}:${frontier}`;
}
