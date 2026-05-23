import WarpError from '../errors/WarpError.ts';
import { isPropValue, type PropValue } from '../types/PropValue.ts';

/** Runtime-backed value for a legacy property compatibility record. */
export default class LegacyPropertyValue {
  private readonly value: PropValue;

  constructor(value: PropValue) {
    this.value = clonePropValue(requirePropValue(value));
    Object.freeze(this);
  }

  /** Returns a defensive copy of the property-compatible value. */
  toPropValue(): PropValue {
    return clonePropValue(this.value);
  }
}

/** Requires a value that can live in the property register. */
function requirePropValue(value: PropValue): PropValue {
  if (!isPropValue(value)) {
    throw new WarpError('LegacyPropertyValue must wrap a PropValue', 'E_VALIDATION');
  }
  return value;
}

/** Copies recursive property values so source carriers stay outside the noun. */
function clonePropValue(value: PropValue): PropValue {
  if (value instanceof Uint8Array) {
    return new Uint8Array(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => clonePropValue(entry));
  }
  if (isPropValueObject(value)) {
    const copy: { [key: string]: PropValue } = {};
    for (const [key, entry] of Object.entries(value)) {
      copy[key] = clonePropValue(entry);
    }
    return copy;
  }
  return value;
}

/** Narrows recursive property objects. */
function isPropValueObject(value: PropValue): value is { [key: string]: PropValue } {
  return value !== null
    && typeof value === 'object'
    && !(value instanceof Uint8Array)
    && !Array.isArray(value);
}
