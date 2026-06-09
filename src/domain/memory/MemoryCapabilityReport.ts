import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import MemoryCapability from './MemoryCapability.ts';

export type MemoryCapabilityReportFields = {
  readonly capabilities: readonly MemoryCapability[];
};

/** Immutable queryable report for bounded, transitional, diagnostic, and legacy memory surfaces. */
export default class MemoryCapabilityReport {
  readonly capabilities: readonly MemoryCapability[];

  constructor(fields: MemoryCapabilityReportFields) {
    this.capabilities = freezeCapabilities(requireReportFields(fields).capabilities);
    Object.freeze(this);
  }

  requireCapability(name: string): MemoryCapability {
    const capability = this.capabilities.find((candidate) => candidate.name === name);
    if (capability !== undefined) {
      return capability;
    }
    throw new MemoryBudgetError('Memory capability report is missing a requested capability', {
      code: 'E_MEMORY_CAPABILITY_MISSING',
      context: { name },
    });
  }

  safeNames(): readonly string[] {
    return this.namesMatching((capability) => capability.posture.isSafe());
  }

  transitionalNames(): readonly string[] {
    return this.namesMatching((capability) => capability.posture.isTransitional());
  }

  diagnosticNames(): readonly string[] {
    return this.namesMatching((capability) => capability.posture.isDiagnostic());
  }

  legacyNames(): readonly string[] {
    return this.namesMatching((capability) => capability.posture.isLegacy());
  }

  private namesMatching(predicate: (capability: MemoryCapability) => boolean): readonly string[] {
    return Object.freeze(this.capabilities.filter(predicate).map((capability) => capability.name));
  }
}

function requireReportFields(
  fields: MemoryCapabilityReportFields | null | undefined,
): MemoryCapabilityReportFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('MemoryCapabilityReport requires object fields', {
    code: 'E_MEMORY_CAPABILITY_INVALID',
    context: { field: 'fields' },
  });
}

function freezeCapabilities(values: readonly MemoryCapability[]): readonly MemoryCapability[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new MemoryBudgetError('Memory capability report requires at least one capability', {
      code: 'E_MEMORY_CAPABILITY_INVALID',
      context: { field: 'capabilities' },
    });
  }
  const names = new Set<string>();
  const capabilities: MemoryCapability[] = [];
  for (const value of values) {
    const capability = requireCapability(value);
    requireUniqueName(names, capability.name);
    capabilities.push(capability);
  }
  return Object.freeze(capabilities);
}

function requireCapability(value: MemoryCapability): MemoryCapability {
  if (value instanceof MemoryCapability) {
    return value;
  }
  throw new MemoryBudgetError('Memory capability report entries must be MemoryCapability values', {
    code: 'E_MEMORY_CAPABILITY_INVALID',
    context: { field: 'capabilities' },
  });
}

function requireUniqueName(names: Set<string>, name: string): void {
  if (!names.has(name)) {
    names.add(name);
    return;
  }
  throw new MemoryBudgetError('Memory capability names must be unique', {
    code: 'E_MEMORY_CAPABILITY_INVALID',
    context: { field: 'name', value: name },
  });
}
