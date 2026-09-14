import type EntityAdmissionOrigin from '../types/EntityAdmissionOrigin.ts';
import WarpError from '../errors/WarpError.ts';
import Intent from './Intent.ts';

const RETAINED_ENTITY_ORIGINS = new WeakMap<Intent, EntityAdmissionOrigin>();

/** Binds trusted retained allocation provenance to an internal replay Intent. */
export function bindRetainedEntityIntent(
  intent: Intent,
  origin: EntityAdmissionOrigin,
): Intent {
  if (!(intent instanceof Intent) || intent.kind !== 'entity.add') {
    throw retainedIntentError('Retained entity provenance requires an entity Intent');
  }
  RETAINED_ENTITY_ORIGINS.set(intent, origin);
  return intent;
}

export function findRetainedEntityIntentOrigin(
  intent: Intent,
): EntityAdmissionOrigin | null {
  return RETAINED_ENTITY_ORIGINS.get(intent) ?? null;
}

function retainedIntentError(message: string): WarpError {
  return new WarpError(message, 'E_DRAFT_INTENT_HYDRATION');
}
