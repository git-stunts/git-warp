import {
  decodeLegacyEdgePropNode,
  isLegacyEdgePropNode,
} from '../../../../src/domain/services/KeyCodec.ts';

const CONTENT_ATTACHMENT_TARGET_PREFIX = 'content-attachment:';
const PROPERTY_TARGET_KEY_PREFIX = 'property-target-key:length-prefixed-v1:';

export class V17GoldenFixtureScratchFactKeyCodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'V17GoldenFixtureScratchFactKeyCodecError';
  }
}

export function publicContentFactKey(targetKey: string): string {
  if (!targetKey.startsWith(CONTENT_ATTACHMENT_TARGET_PREFIX)) {
    throw new V17GoldenFixtureScratchFactKeyCodecError(
      `content attachment target ${targetKey} must use content-attachment prefix`,
    );
  }
  return targetKey.slice(CONTENT_ATTACHMENT_TARGET_PREFIX.length);
}

export function publicPropertyFactKey(targetKey: string): string {
  const decoded = decodePropertyTargetKey(targetKey);
  if (isLegacyEdgePropNode(decoded.ownerId)) {
    const edge = decodeLegacyEdgePropNode(decoded.ownerId);
    return `${edge.from}->${edge.to}:${edge.label}:${decoded.propertyKey}`;
  }
  return `${decoded.ownerId}:${decoded.propertyKey}`;
}

function decodePropertyTargetKey(targetKey: string): {
  readonly ownerId: string;
  readonly propertyKey: string;
} {
  if (!targetKey.startsWith(PROPERTY_TARGET_KEY_PREFIX)) {
    throw new V17GoldenFixtureScratchFactKeyCodecError(
      `property target ${targetKey} must use length-prefixed target format`,
    );
  }
  let cursor = PROPERTY_TARGET_KEY_PREFIX.length;
  const ownerLength = readLength(targetKey, cursor);
  cursor = ownerLength.nextCursor;
  const ownerId = readSizedField(targetKey, cursor, ownerLength.value, 'ownerId', true);
  cursor = ownerId.nextCursor;
  const propertyLength = readLength(targetKey, cursor);
  cursor = propertyLength.nextCursor;
  const propertyKey = readSizedField(targetKey, cursor, propertyLength.value, 'propertyKey', false);
  if (propertyKey.nextCursor !== targetKey.length) {
    throw new V17GoldenFixtureScratchFactKeyCodecError('property target has trailing data');
  }
  return Object.freeze({ ownerId: ownerId.value, propertyKey: propertyKey.value });
}

function readLength(text: string, cursor: number): {
  readonly value: number;
  readonly nextCursor: number;
} {
  const separator = text.indexOf(':', cursor);
  if (separator <= cursor) {
    throw new V17GoldenFixtureScratchFactKeyCodecError('length-prefixed field is malformed');
  }
  const raw = text.slice(cursor, separator);
  if (!/^[0-9]+$/u.test(raw)) {
    throw new V17GoldenFixtureScratchFactKeyCodecError('length-prefixed field length is invalid');
  }
  return Object.freeze({ value: Number(raw), nextCursor: separator + 1 });
}

function readSizedField(
  text: string,
  cursor: number,
  length: number,
  label: string,
  separatorRequired: boolean,
): {
  readonly value: string;
  readonly nextCursor: number;
} {
  const value = text.slice(cursor, cursor + length);
  if (value.length !== length) {
    throw new V17GoldenFixtureScratchFactKeyCodecError(`${label} field is truncated`);
  }
  const nextCursor = cursor + length;
  if (!separatorRequired) {
    return Object.freeze({ value, nextCursor });
  }
  if (text[nextCursor] !== ':') {
    throw new V17GoldenFixtureScratchFactKeyCodecError(`${label} field is missing separator`);
  }
  return Object.freeze({ value, nextCursor: nextCursor + 1 });
}
