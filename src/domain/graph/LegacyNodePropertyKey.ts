import {
  classifyLegacyPropertyKey,
  isContentCompatibilityClassification,
  requireLegacyPropertyKeyValue,
  type LegacyPropertyKeyClassification,
} from './LegacyPropertyKeyClassification.ts';

/** Runtime-backed key for a legacy node property compatibility slot. */
export default class LegacyNodePropertyKey {
  private readonly value: string;

  constructor(value: string) {
    this.value = requireLegacyPropertyKeyValue(value, 'LegacyNodePropertyKey');
    Object.freeze(this);
  }

  /** Returns the stable legacy property key string. */
  toString(): string {
    return this.value;
  }

  /** Classifies this key for compatibility projection decisions. */
  classification(): LegacyPropertyKeyClassification {
    return classifyLegacyPropertyKey(this.value);
  }

  /** Returns true when this key belongs to legacy content compatibility. */
  isContentCompatibilityKey(): boolean {
    return isContentCompatibilityClassification(this.classification());
  }

  /** Compares node property keys by runtime value. */
  equals(other: LegacyNodePropertyKey | null | undefined): boolean {
    if (!(other instanceof LegacyNodePropertyKey)) {
      return false;
    }
    return this.value === other.value;
  }
}
