/**
 * Legacy Anchor Detector for backward compatibility.
 *
 * This module provides parser functions to detect legacy JSON anchors
 * ({"_type":"anchor"}) alongside trailer-based anchors for backward
 * compatibility in E-plane traversals.
 *
 * Both functions accept `unknown` because they are parser boundaries: they // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
 * consume raw, untrusted input (commit messages from git) and narrow it
 * through runtime type checks to a concrete `boolean` result.
 *
 * @module domain/services/LegacyAnchorDetector
 * @see WARP Spec Section 17 - Backward Compatibility
 */

/**
 * Detects if a commit message is a legacy JSON anchor.
 * Legacy anchors are JSON objects with `_type: "anchor"`.
 *
 * @example
 * isLegacyAnchor('{"_type":"anchor"}'); // true
 * isLegacyAnchor('{"_type":"node"}');   // false
 * isLegacyAnchor('plain text');         // false
 */
function hasAnchorType(parsed: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (parsed === null || typeof parsed !== 'object') {
    return false;
  }
  return '_type' in parsed && parsed._type === 'anchor';
}

export function isLegacyAnchor(message: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof message !== 'string') {
    return false;
  }
  try {
    return hasAnchorType(JSON.parse(message.trim())); // nosemgrep: ts-no-json-parse-in-core -- 0025B
  } catch {
    return false;
  }
}

/**
 * Detects if a commit is any type of anchor (legacy JSON or trailer).
 *
 * This function provides unified anchor detection that works across
 * both protocol versions, ensuring anchors are correctly filtered
 * from E-plane traversals regardless of format.
 *
 * @example
 * isAnyAnchor('warp:anchor\n\neg-kind: anchor\neg-graph: test'); // true
 * isAnyAnchor('{"_type":"anchor"}');                             // true
 * isAnyAnchor('Some node content');                              // false
 */
export function isAnyAnchor(message: unknown): boolean { // nosemgrep: ts-no-unknown-outside-adapters -- 0025B
  if (typeof message !== 'string') {
    return false;
  }
  if (message.includes('eg-kind: anchor')) {
    return true;
  }
  return isLegacyAnchor(message);
}
