/**
 * Shared input validation for persistence adapters.
 *
 * These functions are extracted from GitGraphAdapter so that both Git-backed
 * and in-memory adapters apply identical validation rules. This prevents
 * divergence and ensures conformance tests exercise the same constraints.
 *
 * @module infrastructure/adapters/adapterValidation
 */

import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

/** @type {RegExp} Pattern for valid hex OIDs (4–64 hex characters). */
const VALID_OID_PATTERN = /^[0-9a-fA-F]{4,64}$/;

/** @type {RegExp} Pattern for valid Git ref names. */
const VALID_REF_PATTERN = /^[a-zA-Z0-9._/-]+((~\d*|\^\d*|\.\.[a-zA-Z0-9._/-]+)*)$/;

/** @type {RegExp} Pattern for valid Git config keys. */
const VALID_CONFIG_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

/**
 * Asserts an OID has a valid type and is non-empty.
 * @param {string} oid - The OID to check
 * @throws {AdapterValidationError} If the OID is not a non-empty string
 */
function assertOidType(oid) {
  if (typeof oid !== 'string' || oid.length === 0) {
    throw new AdapterValidationError('OID must be a non-empty string');
  }
}

/**
 * Asserts an OID does not exceed the maximum length and matches the hex pattern.
 * @param {string} oid - The OID to check
 * @throws {AdapterValidationError} If the OID is too long or has an invalid format
 */
function assertOidFormat(oid) {
  if (oid.length > 64) {
    throw new AdapterValidationError(`OID too long: ${oid.length} chars. Maximum is 64`);
  }
  if (!VALID_OID_PATTERN.test(oid)) {
    throw new AdapterValidationError(`Invalid OID format: ${oid}`);
  }
}

/**
 * Validates that an OID is a safe hex string (4–64 characters).
 * @param {string} oid - The OID to validate
 * @throws {AdapterValidationError} If OID is invalid
 */
export function validateOid(oid) {
  assertOidType(oid);
  assertOidFormat(oid);
}

/**
 * Asserts a ref has a valid type and is non-empty.
 * @param {string} ref - The ref to check
 * @throws {AdapterValidationError} If the ref is not a non-empty string
 */
function assertRefType(ref) {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new AdapterValidationError('Ref must be a non-empty string');
  }
}

/**
 * Asserts a ref does not exceed the max length, does not start with a dash, and matches the pattern.
 * @param {string} ref - The ref to check
 * @throws {AdapterValidationError} If the ref is too long, starts with a dash, or has an invalid format
 */
function assertRefFormat(ref) {
  if (ref.length > 1024) {
    throw new AdapterValidationError(`Ref too long: ${ref.length} chars. Maximum is 1024`);
  }
  if (ref.startsWith('-')) {
    throw new AdapterValidationError(`Invalid ref: ${ref}. Refs cannot start with - or --. See https://github.com/git-stunts/git-warp#security`);
  }
  if (!VALID_REF_PATTERN.test(ref)) {
    throw new AdapterValidationError(`Invalid ref format: ${ref}. Only alphanumeric characters, ., /, -, _, ^, ~, and range operators are allowed. See https://github.com/git-stunts/git-warp#ref-validation`);
  }
}

/**
 * Validates that a ref is safe to use in git commands.
 * Prevents command injection via malicious ref names.
 * @param {string} ref - The ref to validate
 * @throws {AdapterValidationError} If ref contains invalid characters, is too long, or starts with -/--
 */
export function validateRef(ref) {
  assertRefType(ref);
  assertRefFormat(ref);
}

/**
 * Asserts a limit has a valid numeric type and is finite.
 * @param {number} limit - The limit to check
 * @throws {AdapterValidationError} If the limit is not a finite number or not an integer
 */
function assertLimitType(limit) {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new AdapterValidationError('Limit must be a finite number');
  }
  if (!Number.isInteger(limit)) {
    throw new AdapterValidationError('Limit must be an integer');
  }
}

/**
 * Asserts a limit is within the valid range (1 to 10M).
 * @param {number} limit - The limit to check
 * @throws {AdapterValidationError} If the limit is non-positive or exceeds 10 million
 */
function assertLimitRange(limit) {
  if (limit <= 0) {
    throw new AdapterValidationError('Limit must be a positive integer');
  }
  if (limit > 10_000_000) {
    throw new AdapterValidationError(`Limit too large: ${limit}. Maximum is 10,000,000`);
  }
}

/**
 * Validates that a limit is a safe positive integer (max 10M).
 * @param {number} limit - The limit to validate
 * @throws {AdapterValidationError} If limit is invalid
 */
export function validateLimit(limit) {
  assertLimitType(limit);
  assertLimitRange(limit);
}

/**
 * Asserts a config key has a valid type and is non-empty.
 * @param {string} key - The config key to check
 * @throws {AdapterValidationError} If the key is not a non-empty string
 */
function assertConfigKeyType(key) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new AdapterValidationError('Config key must be a non-empty string');
  }
}

/**
 * Asserts a config key does not exceed max length, does not start with a dash, and matches the pattern.
 * @param {string} key - The config key to check
 * @throws {AdapterValidationError} If the key is too long, starts with a dash, or has an invalid format
 */
function assertConfigKeyFormat(key) {
  if (key.length > 256) {
    throw new AdapterValidationError(`Config key too long: ${key.length} chars. Maximum is 256`);
  }
  if (key.startsWith('-')) {
    throw new AdapterValidationError(`Invalid config key: ${key}. Keys cannot start with -`);
  }
  if (!VALID_CONFIG_KEY_PATTERN.test(key)) {
    throw new AdapterValidationError(`Invalid config key format: ${key}`);
  }
}

/**
 * Validates that a config key is safe and well-formed.
 * @param {string} key - The config key to validate
 * @throws {AdapterValidationError} If key is invalid
 */
export function validateConfigKey(key) {
  assertConfigKeyType(key);
  assertConfigKeyFormat(key);
}
