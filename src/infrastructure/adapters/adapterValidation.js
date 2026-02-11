/**
 * Shared input validation for persistence adapters.
 *
 * These functions are extracted from GitGraphAdapter so that both Git-backed
 * and in-memory adapters apply identical validation rules. This prevents
 * divergence and ensures conformance tests exercise the same constraints.
 *
 * @module infrastructure/adapters/adapterValidation
 */

/**
 * Validates that an OID is a safe hex string (4–64 characters).
 * @param {string} oid - The OID to validate
 * @throws {Error} If OID is invalid
 */
export function validateOid(oid) {
  if (!oid || typeof oid !== 'string') {
    throw new Error('OID must be a non-empty string');
  }
  if (oid.length > 64) {
    throw new Error(`OID too long: ${oid.length} chars. Maximum is 64`);
  }
  const validOidPattern = /^[0-9a-fA-F]{4,64}$/;
  if (!validOidPattern.test(oid)) {
    throw new Error(`Invalid OID format: ${oid}`);
  }
}

/**
 * Validates that a ref is safe to use in git commands.
 * Prevents command injection via malicious ref names.
 * @param {string} ref - The ref to validate
 * @throws {Error} If ref contains invalid characters, is too long, or starts with -/--
 */
export function validateRef(ref) {
  if (!ref || typeof ref !== 'string') {
    throw new Error('Ref must be a non-empty string');
  }
  if (ref.length > 1024) {
    throw new Error(`Ref too long: ${ref.length} chars. Maximum is 1024`);
  }
  if (ref.startsWith('-')) {
    throw new Error(`Invalid ref: ${ref}. Refs cannot start with - or --. See https://github.com/git-stunts/git-warp#security`);
  }
  const validRefPattern = /^[a-zA-Z0-9._/-]+((~\d*|\^\d*|\.\.[a-zA-Z0-9._/-]+)*)$/;
  if (!validRefPattern.test(ref)) {
    throw new Error(`Invalid ref format: ${ref}. Only alphanumeric characters, ., /, -, _, ^, ~, and range operators are allowed. See https://github.com/git-stunts/git-warp#ref-validation`);
  }
}

/**
 * Validates that a limit is a safe positive integer (max 10M).
 * @param {number} limit - The limit to validate
 * @throws {Error} If limit is invalid
 */
export function validateLimit(limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new Error('Limit must be a finite number');
  }
  if (!Number.isInteger(limit)) {
    throw new Error('Limit must be an integer');
  }
  if (limit <= 0) {
    throw new Error('Limit must be a positive integer');
  }
  if (limit > 10_000_000) {
    throw new Error(`Limit too large: ${limit}. Maximum is 10,000,000`);
  }
}

/**
 * Validates that a config key is safe and well-formed.
 * @param {string} key - The config key to validate
 * @throws {Error} If key is invalid
 */
export function validateConfigKey(key) {
  if (!key || typeof key !== 'string') {
    throw new Error('Config key must be a non-empty string');
  }
  if (key.length > 256) {
    throw new Error(`Config key too long: ${key.length} chars. Maximum is 256`);
  }
  if (key.startsWith('-')) {
    throw new Error(`Invalid config key: ${key}. Keys cannot start with -`);
  }
  const validKeyPattern = /^[a-zA-Z][a-zA-Z0-9._-]*$/;
  if (!validKeyPattern.test(key)) {
    throw new Error(`Invalid config key format: ${key}`);
  }
}
