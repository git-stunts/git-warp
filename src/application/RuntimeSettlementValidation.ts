import Lane from '../domain/api/Lane.ts';
import {
  requireLaneRuntime,
  type LaneRuntime,
} from '../domain/api/LaneRuntime.ts';
import type {
  SettlementSourceRuntime,
  SettlementTargetRuntime,
} from '../domain/api/LaneSettlementRuntime.ts';
import WarpError from '../domain/errors/WarpError.ts';
import type { RuntimeSettlementOptions } from './RuntimeSettlementOptions.ts';

export function requireSettlementSourceRuntime(
  options: RuntimeSettlementOptions | null | undefined,
  owner: object,
): SettlementSourceRuntime {
  assertSettlementOptions(options);
  const sourceBinding = requireOwnedLane(options.source, owner);
  const targetBinding = requireOwnedLane(options.target, owner);
  const sourceRuntime = requireSettlementSource(options.source, sourceBinding);
  requireSettlementTarget(options.target, targetBinding);
  assertSettlementParent(options.source, options.target);
  return sourceRuntime;
}

function assertSettlementOptions(
  options: RuntimeSettlementOptions | null | undefined,
): asserts options is RuntimeSettlementOptions {
  if (!isRecord(options)) {
    throw new WarpError(
      'Runtime.previewSettlement options are required',
      'E_RUNTIME_SETTLEMENT_OPTIONS',
    );
  }
  assertSettlementLane(options.source, 'source');
  assertSettlementLane(options.target, 'target');
}

function assertSettlementLane(
  value: unknown,
  role: 'source' | 'target',
): asserts value is Lane {
  if (!(value instanceof Lane)) {
    throw new WarpError(
      `Runtime.previewSettlement requires a ${role} Lane`,
      `E_RUNTIME_SETTLEMENT_${role.toUpperCase()}`,
    );
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireOwnedLane(lane: Lane, owner: object): LaneRuntime {
  const binding = requireLaneRuntime(lane);
  if (binding.owner !== owner) {
    throw new WarpError(
      'Runtime settlement requires Lanes owned by this Runtime',
      'E_RUNTIME_SETTLEMENT_FOREIGN_LANE',
    );
  }
  return binding;
}

function requireSettlementSource(
  lane: Lane,
  binding: LaneRuntime,
): SettlementSourceRuntime {
  if (lane.kind !== 'strand' || binding.settlement.kind !== 'source') {
    throw new WarpError(
      'Runtime.previewSettlement requires a strand source Lane',
      'E_RUNTIME_SETTLEMENT_SOURCE_KIND',
      { context: { kind: lane.kind } },
    );
  }
  return binding.settlement;
}

function requireSettlementTarget(
  lane: Lane,
  binding: LaneRuntime,
): SettlementTargetRuntime {
  if (lane.kind !== 'worldline' || binding.settlement.kind !== 'target') {
    throw new WarpError(
      'Runtime.previewSettlement requires a worldline target Lane',
      'E_RUNTIME_SETTLEMENT_TARGET_KIND',
      { context: { kind: lane.kind } },
    );
  }
  return binding.settlement;
}

function assertSettlementParent(source: Lane, target: Lane): void {
  if (
    source.descriptor.kind !== 'strand'
    || source.descriptor.parent.kind !== target.kind
    || source.descriptor.parent.name !== target.name
  ) {
    throw new WarpError(
      'Runtime.previewSettlement target must be the strand parent Lane',
      'E_RUNTIME_SETTLEMENT_TARGET_PARENT',
    );
  }
}
