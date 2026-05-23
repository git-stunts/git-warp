import WarpError from '../errors/WarpError.ts';
import {
  CONTENT_MIME_PROPERTY_KEY,
  CONTENT_PROPERTY_KEY,
  CONTENT_SIZE_PROPERTY_KEY,
} from './LegacyContentPropertyKeys.ts';

const FIELD_SEPARATOR = '\x00';

export const LEGACY_PROPERTY_KEY_USER = 'user';
export const LEGACY_PROPERTY_KEY_CONTENT_OID = 'content-oid';
export const LEGACY_PROPERTY_KEY_CONTENT_MIME = 'content-mime';
export const LEGACY_PROPERTY_KEY_CONTENT_SIZE = 'content-size';

export type LegacyPropertyKeyClassification =
  | typeof LEGACY_PROPERTY_KEY_USER
  | typeof LEGACY_PROPERTY_KEY_CONTENT_OID
  | typeof LEGACY_PROPERTY_KEY_CONTENT_MIME
  | typeof LEGACY_PROPERTY_KEY_CONTENT_SIZE;

/** Classifies a legacy compatibility property key. */
export function classifyLegacyPropertyKey(value: string): LegacyPropertyKeyClassification {
  if (value === CONTENT_PROPERTY_KEY) {
    return LEGACY_PROPERTY_KEY_CONTENT_OID;
  }
  if (value === CONTENT_MIME_PROPERTY_KEY) {
    return LEGACY_PROPERTY_KEY_CONTENT_MIME;
  }
  if (value === CONTENT_SIZE_PROPERTY_KEY) {
    return LEGACY_PROPERTY_KEY_CONTENT_SIZE;
  }
  return LEGACY_PROPERTY_KEY_USER;
}

/** Returns true when a classification belongs to legacy content metadata. */
export function isContentCompatibilityClassification(
  classification: LegacyPropertyKeyClassification,
): boolean {
  return classification === LEGACY_PROPERTY_KEY_CONTENT_OID
    || classification === LEGACY_PROPERTY_KEY_CONTENT_MIME
    || classification === LEGACY_PROPERTY_KEY_CONTENT_SIZE;
}

/** Validates the shared legacy property key carrier. */
export function requireLegacyPropertyKeyValue(value: string, nounName: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new WarpError(`${nounName} must be a non-empty string`, 'E_VALIDATION');
  }
  if (value.includes(FIELD_SEPARATOR)) {
    throw new WarpError(`${nounName} must not contain NUL bytes`, 'E_VALIDATION');
  }
  return value;
}
