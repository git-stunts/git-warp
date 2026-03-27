/**
 * Test helper: deterministic state digest for WarpRuntime.
 *
 * Computes a SHA-256 hash of the serialized WarpStateV5 + version vector
 * for use in test assertions (e.g., "state did not mutate").
 *
 * @module test/helpers/stateDigest
 */

import { computeStateHashV5 } from '../../src/domain/services/StateSerializerV5.js';
import NodeCryptoAdapter from '../../src/infrastructure/adapters/NodeCryptoAdapter.js';
import { encode } from '../../src/infrastructure/codecs/CborCodec.js';

const crypto = new NodeCryptoAdapter();
const codec = { encode, decode: (/** @type {Buffer} */ b) => b };

/**
 * Computes a deterministic hex digest of a WarpStateV5 state.
 *
 * @param {import('../../src/domain/services/JoinReducer.js').WarpStateV5} state
 * @returns {Promise<string>} Hex SHA-256 digest
 */
export async function stateDigest(state) {
  return await computeStateHashV5(state, { crypto, codec });
}
