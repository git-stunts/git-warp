/**
 * Runtime primitives consumed by Wesley-generated LE-binary codecs.
 *
 * The generated module stays under `src/infrastructure/adapters/**` because it
 * touches raw bytes and boundary failures. Domain code receives only validated
 * runtime nouns constructed by handwritten adapters.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder('utf-8', { fatal: true });
const BOOL_FALSE = 0x00;
const BOOL_TRUE = 0x01;
const NULL_TAG = 0x00;
const PRESENT_TAG = 0x01;
const MAX_LIST_ITEMS = 1_000_000;
const MAX_U32 = 0xffff_ffff;
const MIN_I32 = -0x8000_0000;
const MAX_I32 = 0x7fff_ffff;

/**
 * Error raised when Wesley LE-binary bytes are malformed.
 */
export class CodecError extends Error {
  /**
   * Creates a boundary codec error.
   */
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

/**
 * Append-only little-endian byte writer for generated Wesley codecs.
 */
export class Writer {
  private readonly chunks: Uint8Array[] = [];

  /**
   * Writes an unsigned 32-bit integer in little-endian order.
   */
  writeU32Le(value: number): void {
    this.writeInteger(value, 'u32');
  }

  /**
   * Writes a signed 32-bit integer in little-endian order.
   */
  writeI32Le(value: number): void {
    this.writeInteger(value, 'i32');
  }

  /**
   * Writes a 32-bit float in little-endian order.
   */
  writeF32Le(value: number): void {
    const f32Value = toFiniteF32(value);
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setFloat32(0, f32Value, true);
    this.chunks.push(bytes);
  }

  /**
   * Writes a boolean as a single tag byte.
   */
  writeBool(value: boolean): void {
    this.chunks.push(new Uint8Array([value ? BOOL_TRUE : BOOL_FALSE]));
  }

  /**
   * Writes a UTF-8 string with a u32 little-endian byte length.
   */
  writeString(value: string): void {
    const bytes = textEncoder.encode(value);
    this.writeU32Le(bytes.byteLength);
    this.chunks.push(bytes);
  }

  /**
   * Writes a nullable value with a presence tag.
   */
  writeOption<T>(value: T | null, write: (writer: Writer, value: T) => void): void {
    if (value === null) {
      this.chunks.push(new Uint8Array([NULL_TAG]));
      return;
    }
    this.chunks.push(new Uint8Array([PRESENT_TAG]));
    write(this, value);
  }

  /**
   * Writes a list with a u32 little-endian item count.
   */
  writeList<T>(value: T[], write: (writer: Writer, value: T) => void): void {
    if (value.length > MAX_LIST_ITEMS) {
      throw new CodecError(`Wesley LE-binary list exceeds item limit: ${value.length}`);
    }
    this.writeU32Le(value.length);
    for (const item of value) {
      write(this, item);
    }
  }

  /**
   * Returns the accumulated bytes.
   */
  finish(): Uint8Array {
    let total = 0;
    for (const chunk of this.chunks) {
      total += chunk.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }

  /**
   * Writes a four-byte integer with the requested signedness.
   */
  private writeInteger(value: number, kind: 'u32' | 'i32'): void {
    this.validateInteger(value, kind);
    const bytes = new Uint8Array(4);
    const view = new DataView(bytes.buffer);
    if (kind === 'u32') {
      view.setUint32(0, value, true);
    } else {
      view.setInt32(0, value, true);
    }
    this.chunks.push(bytes);
  }

  /**
   * Validates integer shape and signedness bounds.
   */
  private validateInteger(value: number, kind: 'u32' | 'i32'): void {
    if (!Number.isInteger(value)) {
      throw new CodecError(`Wesley LE-binary ${kind} value must be an integer`);
    }
    if (kind === 'u32') {
      this.validateU32(value);
      return;
    }
    this.validateI32(value);
  }

  /**
   * Validates unsigned 32-bit range.
   */
  private validateU32(value: number): void {
    if (value < 0 || value > MAX_U32) {
      throw new CodecError(`Wesley LE-binary u32 out of range: ${value}`);
    }
  }

  /**
   * Validates signed 32-bit range.
   */
  private validateI32(value: number): void {
    if (value < MIN_I32 || value > MAX_I32) {
      throw new CodecError(`Wesley LE-binary i32 out of range: ${value}`);
    }
  }
}

/**
 * Bounded cursor over Wesley LE-binary bytes.
 */
export class Reader {
  private offset = 0;

  /**
   * Creates a reader over immutable input bytes.
   */
  constructor(private readonly bytes: Uint8Array) {}

  /**
   * Reads an unsigned 32-bit little-endian integer.
   */
  readU32Le(): number {
    return this.readInteger('u32');
  }

  /**
   * Reads a signed 32-bit little-endian integer.
   */
  readI32Le(): number {
    return this.readInteger('i32');
  }

  /**
   * Reads a 32-bit little-endian float.
   */
  readF32Le(): number {
    const bytes = this.readBytes(4);
    const value = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      .getFloat32(0, true);
    toFiniteF32(value);
    return value;
  }

  /**
   * Reads a boolean tag byte.
   */
  readBool(): boolean {
    const tag = this.readTag();
    if (tag === BOOL_FALSE) {
      return false;
    }
    if (tag === BOOL_TRUE) {
      return true;
    }
    throw new CodecError(`invalid boolean tag: ${tag}`);
  }

  /**
   * Reads a u32 length-prefixed UTF-8 string.
   */
  readString(): string {
    const bytes = this.readBytes(this.readU32Le());
    try {
      return textDecoder.decode(bytes);
    } catch {
      throw new CodecError('invalid UTF-8 string');
    }
  }

  /**
   * Reads a nullable value with a presence tag.
   */
  readOption<T>(read: (reader: Reader) => T): T | null {
    const tag = this.readTag();
    if (tag === NULL_TAG) {
      return null;
    }
    if (tag === PRESENT_TAG) {
      return read(this);
    }
    throw new CodecError(`invalid option tag: ${tag}`);
  }

  /**
   * Reads a u32 length-prefixed list.
   */
  readList<T>(read: (reader: Reader) => T): T[] {
    const count = this.readU32Le();
    if (count > MAX_LIST_ITEMS) {
      throw new CodecError(`Wesley LE-binary list exceeds item limit: ${count}`);
    }
    const items: T[] = [];
    for (let index = 0; index < count; index += 1) {
      items.push(read(this));
    }
    return items;
  }

  /**
   * Returns unread byte count.
   */
  remaining(): number {
    return this.bytes.byteLength - this.offset;
  }

  /**
   * Reads a single tag byte.
   */
  private readTag(): number {
    const tag = this.readBytes(1)[0];
    if (tag === undefined) {
      throw new CodecError('unexpected end of Wesley LE-binary input');
    }
    return tag;
  }

  /**
   * Reads exactly `length` bytes or fails closed.
   */
  private readBytes(length: number): Uint8Array {
    const end = this.offset + length;
    if (length < 0 || end > this.bytes.byteLength) {
      throw new CodecError('unexpected end of Wesley LE-binary input');
    }
    const slice = this.bytes.subarray(this.offset, end);
    this.offset = end;
    return slice;
  }

  /**
   * Reads a four-byte integer with the requested signedness.
   */
  private readInteger(kind: 'u32' | 'i32'): number {
    const bytes = this.readBytes(4);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    return kind === 'u32' ? view.getUint32(0, true) : view.getInt32(0, true);
  }
}

/**
 * Converts a Wesley f32 value only when it has deterministic finite semantics.
 */
function toFiniteF32(value: number): number {
  const f32Value = Math.fround(value);
  if (!Number.isFinite(value) || !Number.isFinite(f32Value)) {
    throw new CodecError('Wesley LE-binary f32 value must be finite');
  }
  return f32Value;
}
