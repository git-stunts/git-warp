/**
 * Test helper: deterministic state digest for WarpRuntime.
 *
 * Computes a SHA-256 hash of the serialized WarpState + version vector
 * for use in test assertions (e.g., "state did not mutate").
 *
 * @module test/helpers/stateDigest
 */

import { computeStateHash } from '../../src/domain/services/state/StateSerializer.ts';
import NodeCryptoAdapter from '../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import { encode } from '../../src/infrastructure/codecs/CborCodec.ts';

const crypto = new NodeCryptoAdapter();
const codec = { encode, decode: (/** @type {Buffer} */ b) => b };

/**
 * Computes a deterministic hex digest of a WarpState state.
 *
 * @param {import('../../src/domain/services/JoinReducer.ts').WarpState} state
 * @returns {Promise<string>} Hex SHA-256 digest
 */
export async function stateDigest(state) {
  return await computeStateHash(state, { crypto, codec });
}
