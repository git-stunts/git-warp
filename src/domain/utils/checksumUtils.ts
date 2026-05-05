/**
 * Shared checksum utility for bitmap index builders.
 *
 * Extracted from BitmapIndexBuilder and StreamingBitmapIndexBuilder
 * to eliminate the duplicated computeChecksum function (B136).
 *
 * @module domain/utils/checksumUtils
 */

import { canonicalStringify } from './canonicalStringify.ts';
import type CryptoPort from '../../ports/CryptoPort.ts';

/**
 * Computes a SHA-256 checksum of the given data.
 * Uses canonical JSON stringification for deterministic output
 * across different JavaScript engines.
 */
export const computeChecksum = async (data: object, crypto: CryptoPort): Promise<string> => {
  const json = canonicalStringify(data);
  return await crypto.hash('sha256', json);
};
