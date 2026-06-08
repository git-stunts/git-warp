import MemoryBudgetError from '../errors/MemoryBudgetError.ts';
import MemoryBudget from './MemoryBudget.ts';
import MemoryBudgetLease from './MemoryBudgetLease.ts';
import WarpMemoryPoolSnapshot from './WarpMemoryPoolSnapshot.ts';

export type WarpMemoryPoolFields = {
  readonly name: string;
  readonly budget: MemoryBudget;
};

export type MemoryLeaseRequest = {
  readonly scope: string;
  readonly amount: number;
};

/** Runtime pool for deterministic git-warp-owned memory-budget leases. */
export default class WarpMemoryPool {
  readonly name: string;
  readonly budget: MemoryBudget;
  private _leased: number;
  private _peak: number;
  private _rejected: number;
  private _nextLease: number;
  private readonly _releasedLeases: Set<string>;

  constructor(fields: WarpMemoryPoolFields) {
    const validFields = requirePoolFields(fields);
    this.name = requireNonEmptyString(validFields.name, 'name');
    this.budget = requireMemoryBudget(validFields.budget);
    this._leased = 0;
    this._peak = 0;
    this._rejected = 0;
    this._nextLease = 1;
    this._releasedLeases = new Set();
  }

  acquire(request: MemoryLeaseRequest): MemoryBudgetLease {
    const validRequest = requireLeaseRequest(request);
    const scope = requireNonEmptyString(validRequest.scope, 'scope');
    const amount = requirePositiveInteger(validRequest.amount, 'amount');
    this.assertAvailable(scope, amount);
    this._leased += amount;
    this._peak = Math.max(this._peak, this._leased);
    const id = this.nextLeaseId();
    return new MemoryBudgetLease({
      id,
      name: this.name,
      scope,
      amount,
      unit: this.budget.unit,
      releaseLease: (leaseId) => this.release(leaseId, amount),
    });
  }

  snapshot(): WarpMemoryPoolSnapshot {
    return new WarpMemoryPoolSnapshot({
      name: this.name,
      limit: this.budget.limit,
      unit: this.budget.unit,
      leased: this._leased,
      peak: this._peak,
      rejected: this._rejected,
    });
  }

  private assertAvailable(scope: string, amount: number): void {
    if (this._leased + amount <= this.budget.limit) {
      return;
    }
    this._rejected += 1;
    throw new MemoryBudgetError('Memory budget exceeded for git-warp-owned resident data', {
      context: {
        name: this.name,
        scope,
        unit: this.budget.unit,
        limit: this.budget.limit,
        leased: this._leased,
        requested: amount,
        rejected: this._rejected,
      },
    });
  }

  private release(id: string, amount: number): void {
    if (this._releasedLeases.has(id)) {
      return;
    }
    this._releasedLeases.add(id);
    this._leased -= amount;
  }

  private nextLeaseId(): string {
    const leaseId = `${this.name}:${this._nextLease}`;
    this._nextLease += 1;
    return leaseId;
  }
}

function requirePoolFields(fields: WarpMemoryPoolFields | null | undefined): WarpMemoryPoolFields {
  if (fields !== null && typeof fields === 'object') {
    return fields;
  }
  throw new MemoryBudgetError('WarpMemoryPool requires object fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'fields' },
  });
}

function requireLeaseRequest(request: MemoryLeaseRequest | null | undefined): MemoryLeaseRequest {
  if (request !== null && typeof request === 'object') {
    return request;
  }
  throw new MemoryBudgetError('Memory lease request must be an object', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'request' },
  });
}

function requireMemoryBudget(value: MemoryBudget): MemoryBudget {
  if (value instanceof MemoryBudget) {
    return value;
  }
  throw new MemoryBudgetError('WarpMemoryPool requires a MemoryBudget', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field: 'budget' },
  });
}

function requireNonEmptyString(value: string, field: string): string {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  throw new MemoryBudgetError('WarpMemoryPool requires non-empty identity fields', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field },
  });
}

function requirePositiveInteger(value: number, field: string): number {
  if (Number.isInteger(value) && value > 0) {
    return value;
  }
  throw new MemoryBudgetError('Memory lease amount must be a positive integer', {
    code: 'E_MEMORY_BUDGET_INVALID',
    context: { field, value },
  });
}
