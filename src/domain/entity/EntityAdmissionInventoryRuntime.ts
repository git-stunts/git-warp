import type EntityAdmissionInventoryPort from '../../ports/EntityAdmissionInventoryPort.ts';
import type WarpWorldline from '../WarpWorldline.ts';
import WarpError from '../errors/WarpError.ts';
import type WarpStream from '../stream/WarpStream.ts';
import EntityAdmissionInventoryBasis from './EntityAdmissionInventoryBasis.ts';
import type RetainedEntityAdmission from './RetainedEntityAdmission.ts';

type EntityAdmissionInventoryBinding = Readonly<{
  getFrontier(): Promise<Map<string, string>>;
  inventory: EntityAdmissionInventoryPort;
}>;

const INVENTORIES = new WeakMap<WarpWorldline, EntityAdmissionInventoryBinding>();

export function bindEntityAdmissionInventoryRuntime(
  runtime: WarpWorldline,
  binding: EntityAdmissionInventoryBinding,
): void {
  if (INVENTORIES.has(runtime)) {
    throw inventoryError('Entity admission inventory runtime is already bound');
  }
  INVENTORIES.set(runtime, Object.freeze(binding));
}

export async function captureEntityAdmissionInventoryBasis(
  runtime: WarpWorldline,
): Promise<EntityAdmissionInventoryBasis> {
  const binding = requireInventoryBinding(runtime);
  return new EntityAdmissionInventoryBasis({
    frontier: await binding.getFrontier(),
    worldlineName: runtime.worldlineName,
  });
}

export function scanEntityAdmissions(
  runtime: WarpWorldline,
  basis: EntityAdmissionInventoryBasis,
): WarpStream<RetainedEntityAdmission> {
  if (basis.worldlineName !== runtime.worldlineName) {
    throw inventoryError('Entity admission inventory basis belongs to another worldline');
  }
  return requireInventoryBinding(runtime).inventory.scan(basis);
}

function requireInventoryBinding(
  runtime: WarpWorldline,
): EntityAdmissionInventoryBinding {
  const binding = INVENTORIES.get(runtime);
  if (binding === undefined) {
    throw inventoryError('WarpWorldline has no entity admission inventory runtime');
  }
  return binding;
}

function inventoryError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_INVENTORY_UNAVAILABLE');
}
