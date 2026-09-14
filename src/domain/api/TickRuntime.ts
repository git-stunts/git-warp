import type WarpWorldline from '../WarpWorldline.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type EntityAdmissionInventoryBasis from '../entity/EntityAdmissionInventoryBasis.ts';
import { captureEntityAdmissionInventoryBasis } from '../entity/EntityAdmissionInventoryRuntime.ts';
import WarpError from '../errors/WarpError.ts';
import type { ApiRuntimeContext } from './ApiRuntimeContext.ts';
import Tick from './Tick.ts';

type TickBinding = {
  readonly coordinate: WarpWorldlineCoordinate;
  readonly runtime: WarpWorldline;
};

const tickBindings = new WeakMap<Tick, TickBinding>();
const entityAdmissionInventoryTicks = new WeakMap<Tick, Readonly<{
  basis: EntityAdmissionInventoryBasis;
  runtime: WarpWorldline;
}>>();

export async function createTick(
  runtime: WarpWorldline,
  context: ApiRuntimeContext
): Promise<Tick> {
  await runtime.prepareOpticBasis();
  const coordinate = await runtime.coordinate();
  return await createTickFromCoordinate(runtime, context, coordinate);
}

export async function createForkTick(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
): Promise<Tick> {
  await runtime.prepareForkOpticBasis();
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

export async function createEntityAdmissionInventoryTick(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
): Promise<Tick> {
  const basis = await captureEntityAdmissionInventoryBasis(runtime);
  const tick = new Tick({
    timeline: runtime.worldlineName,
    id: await entityAdmissionInventoryTickId(context, basis),
  });
  entityAdmissionInventoryTicks.set(tick, { basis, runtime });
  return tick;
}

export function requireEntityAdmissionInventoryBasis(
  runtime: WarpWorldline,
  tick: Tick,
): EntityAdmissionInventoryBasis {
  const binding = entityAdmissionInventoryTicks.get(tick);
  if (
    binding === undefined
    || binding.runtime !== runtime
    || tick.timeline !== runtime.worldlineName
  ) {
    throw new WarpError(
      'Tick does not belong to this entity admission inventory',
      'E_TIMELINE_TICK_MISMATCH',
    );
  }
  return binding.basis;
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

async function entityAdmissionInventoryTickId(
  context: ApiRuntimeContext,
  basis: EntityAdmissionInventoryBasis,
): Promise<string> {
  const frontier = basis.frontierEntries.flatMap((entry) => [
    entry.writerId,
    entry.patchSha,
  ]);
  return await context.createOpaqueId('tick', [
    'entity-admission-inventory',
    basis.worldlineName,
    ...frontier,
  ]);
}
