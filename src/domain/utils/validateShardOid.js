/**
 * Validates a shard Object ID (hex string, 4-64 chars).
 *
 * The 4-character minimum accommodates abbreviated OIDs used in test
 * fixtures and short internal IDs. Full Git SHA-1 OIDs are 40 chars;
 * SHA-256 OIDs are 64 chars.
 *
 * @param {string} oid - The OID to validate
 * @returns {boolean} True if oid is a valid hex string of 4-64 characters
 */
export function isValidShardOid(oid) {
  return typeof oid === 'string' && /^[0-9a-fA-F]{4,64}$/.test(oid);
}
