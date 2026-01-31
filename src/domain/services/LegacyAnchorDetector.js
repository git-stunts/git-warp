/**
 * Legacy Anchor Detector for v3 backward compatibility.
 *
 * This module provides functions to detect legacy v3 JSON anchors
 * ({"_type":"anchor"}) alongside v4 trailer-based anchors for
 * backward compatibility in E-plane traversals.
 *
 * @module domain/services/LegacyAnchorDetector
 * @see WARP Spec Section 17 - Backward Compatibility
 */

/**
 * Detects if a commit message is a legacy v3 anchor.
 * v3 anchors are JSON objects with _type: "anchor"
 *
 * @param {string} message - The commit message to check
 * @returns {boolean} True if the message is a v3 JSON anchor
 *
 * @example
 * isLegacyAnchor('{"_type":"anchor"}'); // true
 * isLegacyAnchor('{"_type":"node"}'); // false
 * isLegacyAnchor('plain text'); // false
 */
export function isLegacyAnchor(message) {
  if (typeof message !== 'string') return false;
  try {
    const parsed = JSON.parse(message.trim());
    return parsed && parsed._type === 'anchor';
  } catch {
    return false;
  }
}

/**
 * Detects if a commit is any type of anchor (v3 JSON or v4 trailer).
 *
 * This function provides unified anchor detection that works across
 * both protocol versions, ensuring anchors are correctly filtered
 * from E-plane traversals regardless of format.
 *
 * @param {string} message - The commit message to check
 * @returns {boolean} True if the message is any type of anchor
 *
 * @example
 * // v4 trailer anchor
 * isAnyAnchor('empty-graph:anchor\n\neg-kind: anchor\neg-graph: test'); // true
 *
 * // v3 JSON anchor
 * isAnyAnchor('{"_type":"anchor"}'); // true
 *
 * // Regular message
 * isAnyAnchor('Some node content'); // false
 */
export function isAnyAnchor(message) {
  if (typeof message !== 'string') return false;

  // Check v4 trailer-based anchor
  if (message.includes('eg-kind: anchor')) {
    return true;
  }
  // Check v3 JSON anchor
  return isLegacyAnchor(message);
}
