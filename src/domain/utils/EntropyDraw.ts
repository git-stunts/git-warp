/**
 * EntropyDraw — the one domain entry point for consuming injected entropy.
 *
 * @module domain/utils/EntropyDraw
 */

import EntropyError from '../errors/EntropyError.ts';
import type RandomPort from '../../ports/RandomPort.ts';

function assertDrawLength(length: number): void {
  if (!Number.isInteger(length) || length <= 0) {
    throw new EntropyError(`Entropy draw length must be a positive integer, got ${length}`, {
      code: 'E_ENTROPY_INVALID_LENGTH',
      context: { requested: length },
    });
  }
}

function assertDrawnBytes(bytes: Uint8Array, length: number): void {
  if (bytes instanceof Uint8Array && bytes.length === length) {
    return;
  }
  const received = bytes instanceof Uint8Array ? bytes.length : null;
  throw new EntropyError(`RandomPort returned ${received ?? 'non-byte'} bytes; expected ${length}`, {
    code: 'E_ENTROPY_SHORT_READ',
    context: { requested: length, received },
  });
}

/**
 * Draws exactly `length` bytes from the injected port.
 *
 * A port that returns too few (or too many) bytes would silently weaken a
 * minted identity, so the draw fails closed instead.
 *
 * @throws {EntropyError} `E_ENTROPY_INVALID_LENGTH` or `E_ENTROPY_SHORT_READ`
 */
export function drawEntropy(random: RandomPort, length: number): Uint8Array {
  assertDrawLength(length);
  const bytes = random.randomBytes(length);
  assertDrawnBytes(bytes, length);
  return bytes;
}
