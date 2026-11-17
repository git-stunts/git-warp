/**
 * The deepest CBOR nesting that the codec's default decode bound admits
 * (`CborCodec.decode`). The top-level item is at depth 0, and an item in a
 * container is one level deeper than the container.
 */
export const DEFAULT_DECODE_MAX_DEPTH = 32;
