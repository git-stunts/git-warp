/**
 * Shared input validation for persistence adapters.
 *
 * These functions are extracted from GitTimelineHistoryAdapter so that both Git-backed
 * and in-memory adapters apply identical validation rules. This prevents
 * divergence and ensures conformance tests exercise the same constraints.
 *
 * @module infrastructure/adapters/adapterValidation
 */

import AdapterValidationError from '../../domain/errors/AdapterValidationError.ts';

/** Pattern for valid hex OIDs (4–64 hex characters). */
const VALID_OID_PATTERN = /^[0-9a-fA-F]{4,64}$/;

/** Pattern for valid Git ref names. */
const VALID_REF_PATTERN = /^[a-zA-Z0-9._/-]+((~\d*|\^\d*|\.\.[a-zA-Z0-9._/-]+)*)$/;

/** Pattern for valid Git config keys. */
const VALID_CONFIG_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9._-]*$/;

function assertOidType(oid: string): void {
  if (typeof oid !== 'string' || oid.length === 0) {
    throw new AdapterValidationError('OID must be a non-empty string');
  }
}

function assertOidFormat(oid: string): void {
  if (oid.length > 64) {
    throw new AdapterValidationError(`OID too long: ${oid.length} chars. Maximum is 64`);
  }
  if (!VALID_OID_PATTERN.test(oid)) {
    throw new AdapterValidationError(`Invalid OID format: ${oid}`);
  }
}

/**
 * Validates that an OID is a safe hex string (4–64 characters).
 * @throws {AdapterValidationError} If OID is invalid
 */
export function validateOid(oid: string): void {
  assertOidType(oid);
  assertOidFormat(oid);
}

function assertRefType(ref: string): void {
  if (typeof ref !== 'string' || ref.length === 0) {
    throw new AdapterValidationError('Ref must be a non-empty string');
  }
}

function assertRefFormat(ref: string): void {
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
 * @throws {AdapterValidationError} If ref contains invalid characters, is too long, or starts with -/--
 */
export function validateRef(ref: string): void {
  assertRefType(ref);
  assertRefFormat(ref);
}

function assertLimitType(limit: number): void {
  if (typeof limit !== 'number' || !Number.isFinite(limit)) {
    throw new AdapterValidationError('Limit must be a finite number');
  }
  if (!Number.isInteger(limit)) {
    throw new AdapterValidationError('Limit must be an integer');
  }
}

function assertLimitRange(limit: number): void {
  if (limit <= 0) {
    throw new AdapterValidationError('Limit must be a positive integer');
  }
  if (limit > 10_000_000) {
    throw new AdapterValidationError(`Limit too large: ${limit}. Maximum is 10,000,000`);
  }
}

/**
 * Validates that a limit is a safe positive integer (max 10M).
 * @throws {AdapterValidationError} If limit is invalid
 */
export function validateLimit(limit: number): void {
  assertLimitType(limit);
  assertLimitRange(limit);
}

function assertConfigKeyType(key: string): void {
  if (typeof key !== 'string' || key.length === 0) {
    throw new AdapterValidationError('Config key must be a non-empty string');
  }
}

function assertConfigKeyFormat(key: string): void {
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
 * @throws {AdapterValidationError} If key is invalid
 */
export function validateConfigKey(key: string): void {
  assertConfigKeyType(key);
  assertConfigKeyFormat(key);
}
