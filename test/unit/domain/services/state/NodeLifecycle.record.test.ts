import { expect, it } from 'vitest';
import { NodeLifecycleRecord } from '../../../../../src/domain/artifacts/NodeLifecycleRecord.ts';
import { EventId } from '../../../../../src/domain/utils/EventId.ts';

const clear = new EventId(2, 'A', 'abcdef01', 0);
const fields = { nodeId: 'n', birth: null, clear, pendingRemoves: [], registers: [] };
const unconstructed = { lamport: 1, writerId: 'A', patchSha: 'abcdef01', opIndex: 0 };

it('accepts a clear without a birth and rejects pending removals in current records', () => {
  expect(new NodeLifecycleRecord(fields).clear).toBe(clear);
  expect(() => new NodeLifecycleRecord({ ...fields, pendingRemoves: [clear] })).toThrow(/must be empty/u);
});

it('validates node IDs, constructed events and register ordering at the boundary', () => {
  expect(() => new NodeLifecycleRecord({ ...fields, nodeId: '' })).toThrow(/nodeId/u);
  expect(() => new NodeLifecycleRecord({ ...fields, birth: unconstructed })).toThrow(/EventId/u);
  expect(() => new NodeLifecycleRecord({ ...fields, registers: [['k', unconstructed]] })).toThrow(/EventIds/u);
  expect(() => new NodeLifecycleRecord({ ...fields, registers: [['', clear]] })).toThrow(/register keys/u);
  expect(() => new NodeLifecycleRecord({ ...fields, registers: [['k', clear], ['k', clear]] })).toThrow(/unique/u);
});

it('returns register evidence or null without inventing missing events', () => {
  const record = new NodeLifecycleRecord({ ...fields, registers: [['k', clear]] });
  expect(record.registerEvent('k')).toBe(clear);
  expect(record.registerEvent('missing')).toBeNull();
});

it('keeps validated register evidence intact when a caller mutates the exposed map', () => {
  const record = new NodeLifecycleRecord({ ...fields, registers: [['k', clear]] });
  const exposed = record.registers;
  if (exposed instanceof Map) exposed.clear();
  expect(record.registerEvent('k')).toBe(clear);
  expect([...record.registers]).toEqual([['k', clear]]);
});
