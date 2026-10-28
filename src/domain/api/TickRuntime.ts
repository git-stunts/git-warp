import type WarpWorldline from '../WarpWorldline.ts';
import type WarpWorldlineCoordinate from '../WarpWorldlineCoordinate.ts';
import type EntityAdmissionInventoryBasis from '../entity/EntityAdmissionInventoryBasis.ts';
import {
  captureEntityAdmissionInventoryBasis,
  retainedEntityAdmissionInventoryBases,
} from '../entity/EntityAdmissionInventoryRuntime.ts';
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
  retain: () => Promise<void>;
  runtime: WarpWorldline;
}>>();

export async function createTick(
  runtime: WarpWorldline,
  context: ApiRuntimeContext
): Promise<Tick> {
  return await createTickFromCoordinate(runtime, context, await runtime.captureReadCoordinate());
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

/**
 * Captures the Tick of one inventory Observation: the lane's current cone
 * basis, or, to resume a paged inventory, the basis whose Tick id is
 * `resumeBasisId`, found as the current basis or among the lane's retained
 * captured bases (#1039).
 */
export async function createEntityAdmissionInventoryTick(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  resumeBasisId: string | null = null,
): Promise<Tick> {
  const captured = await captureEntityAdmissionInventoryBasis(runtime);
  const id = await entityAdmissionInventoryTickId(context, captured.basis);
  if (resumeBasisId === null || resumeBasisId === id) {
    return bindInventoryTick({ runtime, basis: captured.basis, retain: captured.retain, id });
  }
  const basis = await retainedInventoryBasis(runtime, context, resumeBasisId);
  return bindInventoryTick({ runtime, basis, retain: async () => {}, id: resumeBasisId });
}

/** The retained basis whose inventory Tick id is `basisId`, or a typed refusal once it is no longer retained. */
async function retainedInventoryBasis(
  runtime: WarpWorldline,
  context: ApiRuntimeContext,
  basisId: string,
): Promise<EntityAdmissionInventoryBasis> {
  for (const basis of await retainedEntityAdmissionInventoryBases(runtime)) {
    if (await entityAdmissionInventoryTickId(context, basis) === basisId) {
      return basis;
    }
  }
  throw new WarpError(
    'The basis this inventory cursor resumes is no longer retained',
    'E_ENTITY_ADMISSION_INVENTORY_CURSOR_BASIS',
  );
}

function bindInventoryTick(fields: Readonly<{
  runtime: WarpWorldline;
  basis: EntityAdmissionInventoryBasis;
  retain: () => Promise<void>;
  id: string;
}>): Tick {
  const tick = new Tick({ timeline: fields.runtime.worldlineName, id: fields.id });
  entityAdmissionInventoryTicks.set(tick, { basis: fields.basis, retain: fields.retain, runtime: fields.runtime });
  return tick;
}

/** Keeps the basis of an inventory Tick reachable, so a continuation cursor can resume it. */
export async function retainEntityAdmissionInventoryTick(runtime: WarpWorldline, tick: Tick): Promise<void> {
  await requireInventoryTickBinding(runtime, tick).retain();
}

export function requireEntityAdmissionInventoryBasis(
  runtime: WarpWorldline,
  tick: Tick,
): EntityAdmissionInventoryBasis {
  return requireInventoryTickBinding(runtime, tick).basis;
}

function requireInventoryTickBinding(
  runtime: WarpWorldline,
  tick: Tick,
): Readonly<{ basis: EntityAdmissionInventoryBasis; retain: () => Promise<void> }> {
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
  return binding;
}

async function tickId(
  context: ApiRuntimeContext,
  coordinate: WarpWorldlineCoordinate
): Promise<string> {
  const frontier = coordinate.frontierEntries.flatMap((entry) => [entry.writerId, entry.patchSha]);
  return await context.createOpaqueId('tick', [
    coordinate.worldlineName,
    ...coordinate.basisIdentity(),
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
