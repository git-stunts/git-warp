import { DEFAULT_DECODE_MAX_DEPTH } from './codec/CodecDecodeDepth.ts';

/**
 * The deepest CBOR nesting at which the patch journal reads a patch. The
 * journal decodes a patch with the codec's default decode bound, so this is
 * that bound's depth. When the patch read bound changes, change this
 * constant: every bound that must hold a patch's property values derives
 * from it.
 */
export const PATCH_DECODE_MAX_DEPTH = DEFAULT_DECODE_MAX_DEPTH;

/**
 * The CBOR levels that a patch adds around a node or edge property value:
 * the patch map, its `ops` array and the op map.
 */
export const PATCH_LEVELS_AROUND_PROPERTY_VALUE = 3;

/**
 * The deepest property value that the patch codec reads back, as the depth
 * of the value's innermost item counted from the value (a value with no
 * container has depth 0).
 */
export const PATCH_PROPERTY_VALUE_MAX_DEPTH = PATCH_DECODE_MAX_DEPTH - PATCH_LEVELS_AROUND_PROPERTY_VALUE;
