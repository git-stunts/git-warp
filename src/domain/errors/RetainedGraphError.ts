import WarpError, { type WarpErrorOptions } from './WarpError.ts';

/** Every refusal a retained graph manifest, its ordinals or its address pages can report (#815). */
export type RetainedGraphErrorCode =
  | 'E_RETAINED_MANIFEST_INVALID'
  | 'E_RETAINED_MANIFEST_MISMATCH'
  | 'E_RETAINED_GEOMETRY_INVALID'
  | 'E_RETAINED_GEOMETRY_UNSUPPORTED'
  | 'E_RETAINED_ORDINAL_INVALID'
  | 'E_RETAINED_ORDINAL_OUT_OF_RANGE'
  | 'E_RETAINED_ADDRESS_MISSING'
  | 'E_RETAINED_ADDRESS_DUPLICATE'
  | 'E_RETAINED_ADDRESS_KIND_MISMATCH';

/**
 * Error class for retained graph manifests and their ordinal index (#815).
 *
 * ## Error Codes
 *
 * | Code | Description |
 * |------|-------------|
 * | `E_RETAINED_MANIFEST_INVALID` | A manifest or commitment violates its constructor invariants |
 * | `E_RETAINED_MANIFEST_MISMATCH` | A pinned ordinal was resolved against another manifest |
 * | `E_RETAINED_GEOMETRY_INVALID` | An ordinal geometry violates its shape invariants |
 * | `E_RETAINED_GEOMETRY_UNSUPPORTED` | The record layout does not store pages of this geometry |
 * | `E_RETAINED_ORDINAL_INVALID` | An ordinal or segment violates its invariants, or lies outside the page asked |
 * | `E_RETAINED_ORDINAL_OUT_OF_RANGE` | An ordinal lies outside the geometry or the manifest's writer chains |
 * | `E_RETAINED_ADDRESS_MISSING` | No element added under the ordinal |
 * | `E_RETAINED_ADDRESS_DUPLICATE` | More than one element added under the ordinal |
 * | `E_RETAINED_ADDRESS_KIND_MISMATCH` | The ordinal and the addressed record are of different kinds |
 */
export default class RetainedGraphError extends WarpError {
  constructor(message: string, code: RetainedGraphErrorCode, options: Omit<WarpErrorOptions, 'code'> = {}) {
    super(message, code, options);
  }
}
