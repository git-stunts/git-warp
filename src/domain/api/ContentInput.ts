/** Portable byte sources accepted by content staging. */
export type ContentInput =
  | AsyncIterable<Uint8Array>
  | ReadableStream<Uint8Array>
  | Uint8Array
  | string;
