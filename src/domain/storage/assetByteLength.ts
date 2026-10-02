import WarpError from '../errors/WarpError.ts';

const intrinsicByteLengthDescriptor = Object.getOwnPropertyDescriptor(
  Object.getPrototypeOf(Uint8Array.prototype), 'byteLength',
);

/** Reads the native typed-array byte count without caller-owned property access. */
export default function assetByteLength(bytes: Uint8Array): number {
  if (intrinsicByteLengthDescriptor?.get === undefined) {
    throw new WarpError('Typed-array byte length capability is unavailable', 'E_ASSET_BYTE_LENGTH');
  }
  return requireByteCount(intrinsicByteLengthDescriptor.get.call(bytes));
}

function requireByteCount<T>(value: T): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new WarpError('Typed-array byte count is invalid', 'E_ASSET_BYTE_LENGTH');
  }
  return value;
}
