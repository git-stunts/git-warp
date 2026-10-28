import WarpError from '../errors/WarpError.ts';
import EntityAdmission from './EntityAdmission.ts';
import EntityAdmissionInventoryCursor from './EntityAdmissionInventoryCursor.ts';
import Observer from './Observer.ts';
import type { ReadingValue } from './ReadingValue.ts';

/** Admissions one inventory Observation emits when the caller declares no limit. */
export const ENTITY_ADMISSION_INVENTORY_DEFAULT_LIMIT = 10_000;
/** The largest limit one inventory Observation accepts. */
export const ENTITY_ADMISSION_INVENTORY_MAX_LIMIT = 1_000_000;

/** Paging of one inventory Observation: at most `limit` admissions, resuming after `cursor`. */
export type EntityAdmissionInventoryObserverOptions = Readonly<{
  limit?: number;
  cursor?: string;
}>;

/** The validated paging an inventory Observer declares. */
export type EntityAdmissionInventoryPaging = Readonly<{
  limit: number;
  resume: Readonly<{ cursor: EntityAdmissionInventoryCursor; check: string }> | null;
}>;

const ENTITY_ADMISSION_INVENTORY_OBSERVERS = new WeakMap<Observer, EntityAdmissionInventoryPaging>();

/**
 * Creates the whole-Lane retained entity admission inventory Observer. One
 * Observation emits at most `limit` admissions (default
 * {@link ENTITY_ADMISSION_INVENTORY_DEFAULT_LIMIT}); when more remain, its
 * Receipt carries a continuation cursor instead of a certificate, and an
 * Observer created with that `cursor` resumes the same basis.
 */
export function createEntityAdmissionInventoryObserver(
  id: string,
  options: EntityAdmissionInventoryObserverOptions = {},
): Observer<EntityAdmission> {
  const paging = inventoryPaging(options);
  const observer = new Observer<EntityAdmission>({
    cardinality: 'many',
    decode: requireEntityAdmission,
    id,
  });
  ENTITY_ADMISSION_INVENTORY_OBSERVERS.set(observer, paging);
  return observer;
}

export function isEntityAdmissionInventoryObserver<TValue extends ReadingValue>(
  observer: Observer<TValue>,
): boolean {
  return ENTITY_ADMISSION_INVENTORY_OBSERVERS.has(observer);
}

/** The paging an inventory Observer was created with. */
export function requireEntityAdmissionInventoryPaging<TValue extends ReadingValue>(
  observer: Observer<TValue>,
): EntityAdmissionInventoryPaging {
  const paging = ENTITY_ADMISSION_INVENTORY_OBSERVERS.get(observer);
  if (paging === undefined) {
    throw new WarpError('Observer is not an entity admission inventory', 'E_ENTITY_ADMISSION_INVENTORY_OBSERVER');
  }
  return paging;
}

function inventoryPaging(options: EntityAdmissionInventoryObserverOptions): EntityAdmissionInventoryPaging {
  if (options === null || typeof options !== 'object') {
    throw pagingError('Entity admission inventory options must be an object');
  }
  const resume = options.cursor === undefined ? null : EntityAdmissionInventoryCursor.parse(options.cursor);
  return Object.freeze({ limit: requireLimit(options.limit ?? ENTITY_ADMISSION_INVENTORY_DEFAULT_LIMIT), resume });
}

function requireLimit(limit: number): number {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > ENTITY_ADMISSION_INVENTORY_MAX_LIMIT) {
    throw pagingError(`Entity admission inventory limit must be an integer from 1 to ${ENTITY_ADMISSION_INVENTORY_MAX_LIMIT}`);
  }
  return limit;
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

function pagingError(message: string): WarpError {
  return new WarpError(message, 'E_ENTITY_ADMISSION_INVENTORY_PAGING');
}
