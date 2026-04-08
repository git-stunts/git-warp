/**
 * WorldlineSelector — abstract base for worldline selector descriptors.
 *
 * A worldline selector specifies which worldline an observer projects.
 * Three variants: LiveSelector (canonical worldline),
 * CoordinateSelector (hypothetical worldline at specific writer tips),
 * StrandSelector (single writer's isolated worldline).
 *
 * @module domain/types/WorldlineSelector
 */

type WorldlineSelectorCtor = new (...args: never[]) => WorldlineSelector;

/**
 * Validates a ceiling value. Must be null, undefined, or a non-negative integer.
 */
function validateCeiling(ceiling: number | null | undefined): number | null {
  if (ceiling === undefined || ceiling === null) {
    return null;
  }
  if (typeof ceiling !== 'number' || !Number.isInteger(ceiling) || ceiling < 0) {
    throw new TypeError(`ceiling must be null or a non-negative integer, got ${typeof ceiling === 'number' ? ceiling : typeof ceiling}`);
  }
  return ceiling;
}

/**
 * Subclass registry — populated by each subclass module on import.
 */
const registry: Record<string, WorldlineSelectorCtor> = {};

/**
 * Abstract base for worldline selectors.
 *
 * Subclasses: LiveSelector, CoordinateSelector, StrandSelector.
 * Use WorldlineSelector.from() to convert plain { kind } objects
 * at API boundaries.
 */
class WorldlineSelector {
  /**
   * Deep-clone this selector.
   */
  clone(): WorldlineSelector {
    throw new Error('WorldlineSelector.clone() is abstract');
  }

  /**
   * Convert this selector to a plain DTO matching the WorldlineSource shape.
   */
  toDTO(): { kind: string; [key: string]: unknown } {
    throw new Error('WorldlineSelector.toDTO() is abstract');
  }

  /**
   * Register a subclass for use in from().
   */
  static _register(kind: string, ctor: WorldlineSelectorCtor): void {
    if (Object.isFrozen(registry)) {
      throw new Error('WorldlineSelector registry is frozen — cannot register after first use');
    }
    registry[kind] = ctor;
  }

  /**
   * Normalize a raw source descriptor into a WorldlineSelector instance.
   *
   * Accepts class instances (returned as-is), plain { kind } objects
   * (converted to the appropriate subclass), and null/undefined
   * (defaults to LiveSelector).
   */
  static from(raw: WorldlineSelector | { kind: string; [key: string]: unknown } | null | undefined): WorldlineSelector {
    if (raw instanceof WorldlineSelector) {
      return raw;
    }
    // Freeze registry on first use — prevents post-init hijacking
    if (!Object.isFrozen(registry)) {
      Object.freeze(registry);
    }
    return fromPlainObject(raw);
  }
}

/**
 * Builds a WorldlineSelector from a plain object or null/undefined.
 *
 * Note: the kind->constructor-args mapping is hardcoded for the three
 * known selector kinds. Adding a new kind requires editing this function.
 *
 * Kept separate from the class to reduce static from() complexity.
 */
function fromPlainObject(raw: { kind: string; [key: string]: unknown } | null | undefined): WorldlineSelector {
  const value = raw ?? { kind: 'live' };
  const { kind } = value;
  if (!(kind in registry)) {
    throw new TypeError(`unknown worldline selector kind: ${String(kind)}`);
  }
  const Ctor = registry[kind]!;
  if (kind === 'live') {
    return new (Ctor as new (ceiling: unknown) => WorldlineSelector)(value['ceiling']);
  }
  if (kind === 'coordinate') {
    return new (Ctor as new (frontier: unknown, ceiling: unknown) => WorldlineSelector)(value['frontier'], value['ceiling']);
  }
  return new (Ctor as new (strandId: unknown, ceiling: unknown) => WorldlineSelector)(value['strandId'], value['ceiling']);
}

export { validateCeiling };
export default WorldlineSelector;
