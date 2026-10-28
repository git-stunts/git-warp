import type WarpWorldline from '../WarpWorldline.ts';
import ConeObstructedError from '../errors/ConeObstructedError.ts';
import WarpError from '../errors/WarpError.ts';
import ConeBasis from '../services/cone/ConeBasis.ts';
import type ConeLaneBasis from '../services/cone/ConeLaneBasis.ts';
import type ConeAdmissionMerge from './ConeAdmissionMerge.ts';
import ConeEntityAdmissionInventory from './ConeEntityAdmissionInventory.ts';
import EntityAdmissionInventoryBasis from './EntityAdmissionInventoryBasis.ts';

type EntityAdmissionInventoryBinding = Readonly<{
  cone: ConeLaneBasis;
  inventory: ConeEntityAdmissionInventory;
}>;

/** An inventory basis captured from the lane's cone basis, and how to keep it reachable for a later page. */
export type CapturedEntityAdmissionInventoryBasis = Readonly<{
  basis: EntityAdmissionInventoryBasis;
  retain: () => Promise<void>;
}>;

const INVENTORIES = new WeakMap<WarpWorldline, EntityAdmissionInventoryBinding>();

/** Binds a worldline's inventory to its lane's cone basis and admission index (#1039). */
export function bindEntityAdmissionInventoryRuntime(runtime: WarpWorldline, cone: ConeLaneBasis): void {
  if (INVENTORIES.has(runtime)) {
    throw inventoryError('Entity admission inventory runtime is already bound');
  }
  INVENTORIES.set(runtime, Object.freeze({ cone, inventory: new ConeEntityAdmissionInventory({ reader: cone.reader }) }));
}

/** Advances the lane's cone basis and captures the inventory basis it settles on. */
export async function captureEntityAdmissionInventoryBasis(
  runtime: WarpWorldline,
): Promise<CapturedEntityAdmissionInventoryBasis> {
  const { cone } = requireInventoryBinding(runtime);
  const captured = await cone.advanceRetainable();
  if (!(captured.basis instanceof ConeBasis)) {
    throw new ConeObstructedError(cone.lane, captured.basis);
  }
  return Object.freeze({ basis: inventoryBasis(runtime, captured.basis), retain: captured.retain });
}

/** The inventory bases of the lane's retained captured cone bases, oldest first. */
export async function retainedEntityAdmissionInventoryBases(
  runtime: WarpWorldline,
): Promise<readonly EntityAdmissionInventoryBasis[]> {
  const { cone } = requireInventoryBinding(runtime);
  return (await cone.retainedBases()).map((basis) => inventoryBasis(runtime, basis));
}

/** Opens the admission merge of `basis`, from the newest admission or from `remaining`. */
export async function openEntityAdmissions(
  runtime: WarpWorldline,
  basis: EntityAdmissionInventoryBasis,
  remaining: ReadonlyMap<string, number> | null,
): Promise<ConeAdmissionMerge> {
  if (basis.worldlineName !== runtime.worldlineName) {
    throw inventoryError('Entity admission inventory basis belongs to another worldline');
  }
  return await requireInventoryBinding(runtime).inventory.open(basis, remaining);
}

function inventoryBasis(runtime: WarpWorldline, basis: ConeBasis): EntityAdmissionInventoryBasis {
  return new EntityAdmissionInventoryBasis({
    frontier: new Map(basis.writerHeads()),
    root: basis.root,
    worldlineName: runtime.worldlineName,
  });
}

function requireInventoryBinding(runtime: WarpWorldline): EntityAdmissionInventoryBinding {
  const binding = INVENTORIES.get(runtime);
  if (binding === undefined) {
    throw inventoryError('WarpWorldline has no entity admission inventory runtime');
  }
  return binding;
}

function inventoryError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_INVENTORY_UNAVAILABLE');
}
