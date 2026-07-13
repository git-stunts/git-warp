import WarpError from '../errors/WarpError.ts';
import { copyPropValue, isPropValue, type PropValue } from '../types/PropValue.ts';

/** Runtime-backed value for a legacy property compatibility record. */
export default class LegacyPropertyValue {
  private readonly value: PropValue;

  constructor(value: PropValue) {
    this.value = copyPropValue(requirePropValue(value));
    Object.freeze(this);
  }

  /** Returns a defensive copy of the property-compatible value. */
  toPropValue(): PropValue {
    return copyPropValue(this.value);
  }
}

/** Requires a value that can live in the property register. */
function requirePropValue(value: PropValue): PropValue {
  if (!isPropValue(value)) {
    throw new WarpError('LegacyPropertyValue must wrap a PropValue', 'E_VALIDATION');
  }
  return value;
}
