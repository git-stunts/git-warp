import PatchError from '../errors/PatchError.ts';
import { OP_TYPES } from '../types/TickReceipt.ts';

const REQUIRED_STRATEGY_METHODS = Object.freeze([
  'validate',
  'mutate',
  'outcome',
  'snapshot',
  'accumulate',
] as const);

type RequiredStrategyMethod = typeof REQUIRED_STRATEGY_METHODS[number];

export type OpStrategyRegistryEntry = {
  readonly receiptName?: string;
  readonly validate?: object;
  readonly mutate?: object;
  readonly outcome?: object;
  readonly snapshot?: object;
  readonly accumulate?: object;
};

const VALID_RECEIPT_OPS: ReadonlySet<string> = new Set(OP_TYPES);

export function validateOpStrategyRegistry(
  registry: ReadonlyMap<string, OpStrategyRegistryEntry>,
  validReceiptOps: ReadonlySet<string> = VALID_RECEIPT_OPS,
): void {
  for (const [opType, strategy] of registry) {
    for (const methodName of REQUIRED_STRATEGY_METHODS) {
      requireStrategyMethod(opType, strategy, methodName);
    }
    const receiptName = requireReceiptName(opType, strategy);
    if (!validReceiptOps.has(receiptName)) {
      throw new PatchError(
        `OpStrategy '${opType}' receiptName '${receiptName}' is not in TickReceipt OP_TYPES`,
        { context: { opType, receiptName } },
      );
    }
  }
}

function requireStrategyMethod(
  opType: string,
  strategy: OpStrategyRegistryEntry,
  methodName: RequiredStrategyMethod,
): void {
  if (typeof strategy[methodName] === 'function') {
    return;
  }
  throw new PatchError(
    `OpStrategy '${opType}' is missing method '${methodName}'`,
    { context: { opType, methodName } },
  );
}

function requireReceiptName(opType: string, strategy: OpStrategyRegistryEntry): string {
  if (typeof strategy.receiptName === 'string' && strategy.receiptName.length > 0) {
    return strategy.receiptName;
  }
  throw new PatchError(
    `OpStrategy '${opType}' is missing receiptName`,
    { context: { opType } },
  );
}
