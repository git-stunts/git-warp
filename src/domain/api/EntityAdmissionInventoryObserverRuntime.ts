import WarpError from '../errors/WarpError.ts';
import EntityAdmission from './EntityAdmission.ts';
import Observer from './Observer.ts';
import type { ReadingValue } from './ReadingValue.ts';

const ENTITY_ADMISSION_INVENTORY_OBSERVERS = new WeakSet<Observer>();

/** Creates the whole-Lane retained entity admission inventory Observer. */
export function createEntityAdmissionInventoryObserver(
  id: string,
): Observer<EntityAdmission> {
  const observer = new Observer<EntityAdmission>({
    cardinality: 'many',
    decode: requireEntityAdmission,
    id,
  });
  ENTITY_ADMISSION_INVENTORY_OBSERVERS.add(observer);
  return observer;
}

export function isEntityAdmissionInventoryObserver<TValue extends ReadingValue>(
  observer: Observer<TValue>,
): boolean {
  return ENTITY_ADMISSION_INVENTORY_OBSERVERS.has(observer);
}

function requireEntityAdmission(value: ReadingValue): EntityAdmission {
  if (!(value instanceof EntityAdmission)) {
    throw new WarpError(
      'Entity admission inventory decoded a non-admission value',
      'E_ENTITY_ADMISSION_INVENTORY_VALUE',
    );
  }
  return value;
}
