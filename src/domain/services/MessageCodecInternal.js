/**
 * Shared internals for WARP message codecs.
 *
 * This module provides the lazy TrailerCodec singleton, constants, and
 * validation helpers used by PatchMessageCodec, CheckpointMessageCodec,
 * AnchorMessageCodec, and MessageSchemaDetector.
 *
 * Not part of the public API — consumers should import from
 * WarpMessageCodec.js (the facade) or the individual sub-codecs.
 *
 * @module domain/services/MessageCodecInternal
 * @private
 */

// @ts-expect-error -- no declaration file for @git-stunts/trailer-codec
import { TrailerCodec, TrailerCodecService } from '@git-stunts/trailer-codec';

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

/**
 * Message title prefixes for each WARP commit type.
 * @type {Object<string, string>}
 */
export const MESSAGE_TITLES = {
  patch: 'warp:patch',
  checkpoint: 'warp:checkpoint',
  anchor: 'warp:anchor',
  audit: 'warp:audit',
};

/**
 * Standard trailer keys used across WARP messages.
 * @type {Object<string, string>}
 */
export const TRAILER_KEYS = {
  kind: 'eg-kind',
  graph: 'eg-graph',
  writer: 'eg-writer',
  lamport: 'eg-lamport',
  patchOid: 'eg-patch-oid',
  stateHash: 'eg-state-hash',
  frontierOid: 'eg-frontier-oid',
  indexOid: 'eg-index-oid',
  schema: 'eg-schema',
  checkpointVersion: 'eg-checkpoint',
  dataCommit: 'eg-data-commit',
  opsDigest: 'eg-ops-digest',
};

/**
 * Pattern for valid Git OIDs (40-character hex for SHA-1 or 64-character for SHA-256).
 * @type {RegExp}
 */
const OID_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/;

/**
 * Pattern for valid SHA-256 state hashes (64-character hex).
 * @type {RegExp}
 */
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

// -----------------------------------------------------------------------------
// Codec Instance
// -----------------------------------------------------------------------------

// Lazy singleton codec instance
/** @type {TrailerCodec|null} */
let _codec = null;

/**
 * Returns the lazy singleton TrailerCodec instance.
 * @returns {TrailerCodec}
 */
export function getCodec() {
  if (!_codec) {
    const service = new TrailerCodecService();
    _codec = new TrailerCodec({ service });
  }
  return _codec;
}

// -----------------------------------------------------------------------------
// Validation Helpers
// -----------------------------------------------------------------------------

/**
 * Validates that a value is a valid Git OID.
 * @param {string} oid - The OID to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {Error} If the OID is invalid
 */
export function validateOid(oid, fieldName) {
  if (typeof oid !== 'string') {
    throw new Error(`Invalid ${fieldName}: expected string, got ${typeof oid}`);
  }
  if (!OID_PATTERN.test(oid)) {
    throw new Error(`Invalid ${fieldName}: must be a 40 or 64 character hex string, got '${oid}'`);
  }
}

/**
 * Validates that a value is a valid SHA-256 hash.
 * @param {string} hash - The hash to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {Error} If the hash is invalid
 */
export function validateSha256(hash, fieldName) {
  if (typeof hash !== 'string') {
    throw new Error(`Invalid ${fieldName}: expected string, got ${typeof hash}`);
  }
  if (!SHA256_PATTERN.test(hash)) {
    throw new Error(`Invalid ${fieldName}: must be a 64 character hex string, got '${hash}'`);
  }
}

/**
 * Validates that a value is a positive integer.
 * @param {number} value - The value to validate
 * @param {string} fieldName - Name of the field for error messages
 * @throws {Error} If the value is not a positive integer
 */
export function validatePositiveInteger(value, fieldName) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new Error(`Invalid ${fieldName}: must be a positive integer, got ${value}`);
  }
}

/**
 * Validates that a schema version is valid.
 * @param {number} schema - The schema version to validate
 * @throws {Error} If the schema version is invalid
 */
export function validateSchema(schema) {
  validatePositiveInteger(schema, 'schema');
}
