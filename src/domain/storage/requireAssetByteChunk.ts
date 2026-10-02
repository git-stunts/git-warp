import WarpError from '../errors/WarpError.ts';

/** Establishes the byte representation before size accounting or forwarding. */
export default function requireAssetByteChunk(chunk: Uint8Array): Uint8Array {
  if (!(chunk instanceof Uint8Array)) {
    throw new WarpError('Asset stream chunks must be Uint8Array instances', 'E_ASSET_CHUNK_INVALID');
  }
  return chunk;
}
