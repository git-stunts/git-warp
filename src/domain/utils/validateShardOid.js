/**
 * Validates a shard Object ID (hex string, 4-64 chars).
 *
 * @param {string} oid - The OID to validate
 * @returns {boolean} True if oid is a valid hex string of 4-64 characters
 */
export function isValidOid(oid) {
  return typeof oid === 'string' && /^[0-9a-fA-F]{4,64}$/.test(oid);
}
