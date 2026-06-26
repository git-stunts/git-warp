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
const WARP_MESSAGE_PREFIX = 'warp:';

/**
 * Checks whether a parsed legacy JSON value carries the anchor type marker.
 */
function hasAnchorType(parsed: unknown): boolean {
  if (parsed === null || typeof parsed !== 'object') {
    return false;
  }
  return Reflect.get(parsed, LEGACY_TYPE_KEY) === ANCHOR_TYPE;
}

/**
 * Checks whether a WARP trailer block carries the anchor kind marker.
 */
function hasAnchorTrailer(message: string): boolean {
  const trimmed = message.trimEnd();
  if (!trimmed.startsWith(WARP_MESSAGE_PREFIX)) {
    return false;
  }
  const trailerStart = trimmed.lastIndexOf('\n\n');
  if (trailerStart === -1) {
    return false;
  }
  return trimmed
    .slice(trailerStart + 2)
    .split('\n')
    .some((line) => line.trim() === TRAILER_ANCHOR_MARKER);
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
  if (hasAnchorTrailer(message)) {
    return true;
  }
  return isLegacyAnchor(message);
}
