import type WarpWorldline from '../WarpWorldline.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import WarpError from '../errors/WarpError.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import Tick from './Tick.ts';

type TickBinding = {
  readonly coordinate: WarpWorldlineCoordinate;
  readonly runtime: WarpWorldline;
};

const tickBindings = new WeakMap<Tick, TickBinding>();

export async function createTick(
  runtime: WarpWorldline,
  context: ApiRuntimeContext
): Promise<Tick> {
  await runtime.prepareOpticBasis();
  const coordinate = await runtime.coordinate();
  return await createTickFromCoordinate(runtime, context, coordinate);
}

export async function createTickFromCoordinate(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  coordinate: WarpWorldlineCoordinate
): Promise<Tick> {
  const tick = new Tick({
    timeline: runtime.worldlineName,
    id: await tickId(context, coordinate),
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

async function tickId(
  context: ApiRuntimeContext,
  coordinate: WarpWorldlineCoordinate
): Promise<string> {
  const frontier = coordinate.frontierEntries.flatMap((entry) => [entry.writerId, entry.patchSha]);
  return await context.createOpaqueId('tick', [
    coordinate.worldlineName,
    coordinate.checkpointSha,
    ...frontier,
  ]);
}
