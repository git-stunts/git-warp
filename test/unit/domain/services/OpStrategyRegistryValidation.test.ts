import { describe, expect, it } from 'vitest';

import PatchError from '../../../../src/domain/errors/PatchError.ts';
import {
  validateOpStrategyRegistry,
  type OpStrategyRegistryEntry,
} from '../../../../src/domain/services/OpStrategyRegistryValidation.ts';

const VALID_RECEIPT_OPS = new Set(['NodeAdd']);

function makeStrategy(overrides: Partial<OpStrategyRegistryEntry> = {}): OpStrategyRegistryEntry {
  return {
    receiptName: 'NodeAdd',
    validate() {},
    mutate() {},
    outcome() {},
    snapshot() {},
    accumulate() {},
    ...overrides,
  };
}

describe('validateOpStrategyRegistry', () => {
  it('accepts a complete strategy whose receipt name is valid', () => {
    const registry = new Map([['NodeAdd', makeStrategy()]]);

    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).not.toThrow();
  });

  it('rejects a strategy missing a required method', () => {
    const { mutate: _mutate, ...strategy } = makeStrategy();
    const registry = new Map([['NodeAdd', strategy]]);

    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(PatchError);
    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(
      "OpStrategy 'NodeAdd' is missing method 'mutate'",
    );
  });

  it('rejects a null strategy value with PatchError', () => {
    const registry = new Map<string, OpStrategyRegistryEntry>();
    registry.set('NodeAdd', Reflect.get(Object.freeze({ NodeAdd: null }), 'NodeAdd'));

    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(PatchError);
    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(
      "OpStrategy 'NodeAdd' must be an object",
    );
  });

  it('rejects a strategy missing receiptName', () => {
    const { receiptName: _receiptName, ...strategy } = makeStrategy();
    const registry = new Map([['NodeAdd', strategy]]);

    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(PatchError);
    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(
      "OpStrategy 'NodeAdd' is missing receiptName",
    );
  });

  it('rejects a strategy whose receiptName is outside the receipt op set', () => {
    const registry = new Map([['NodeAdd', makeStrategy({ receiptName: 'BogusReceipt' })]]);

    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(PatchError);
    expect(() => validateOpStrategyRegistry(registry, VALID_RECEIPT_OPS)).toThrow(
      "OpStrategy 'NodeAdd' receiptName 'BogusReceipt' is not in TickReceipt OP_TYPES",
    );
  });
});
