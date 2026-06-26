/**
 * Legacy anchor commit-message detector.
 *
 * This adapter keeps raw commit-message parsing outside the domain layer while
 * preserving backward compatibility with legacy JSON anchors
 * (`{"_type":"anchor"}`) and trailer-based anchors.
 *
 * @module infrastructure/adapters/LegacyAnchorMessageDetectorAdapter
 */

const ANCHOR_TYPE = 'anchor';
const LEGACY_TYPE_KEY = '_type';
const TRAILER_ANCHOR_MARKER = 'eg-kind: anchor';

/**
 * Checks whether a parsed legacy JSON value carries the anchor type marker.
 */
function hasAnchorType(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') {
    return false;
  }
  return Reflect.get(parsed, LEGACY_TYPE_KEY) === ANCHOR_TYPE;
}

/** Detects a legacy JSON anchor commit message. */
export function isLegacyAnchor(message: unknown): boolean {
  if (typeof message !== 'string') {
    return false;
  }
  try {
    const parsed: unknown = JSON.parse(message.trim());
    return hasAnchorType(parsed);
  } catch {
    return false;
  }
}

/** Detects either a legacy JSON anchor or a trailer-based anchor message. */
export function isAnyAnchor(message: unknown): boolean {
  if (typeof message !== 'string') {
    return false;
  }
  if (message.includes(TRAILER_ANCHOR_MARKER)) {
    return true;
  }
  return isLegacyAnchor(message);
}
