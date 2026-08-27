import { describe, expect, it } from 'vitest';
import VersionVector from '../../../../src/domain/crdt/VersionVector.ts';
import PatchError from '../../../../src/domain/errors/PatchError.ts';
import Patch from '../../../../src/domain/types/Patch.ts';
import { Dot } from '../../../../src/domain/crdt/Dot.ts';
import NodeAdd from '../../../../src/domain/types/ops/NodeAdd.ts';

describe('Patch', () => {
  it('freezes a valid patch and copies mutable inputs', () => {
    const retainedOp = new NodeAdd('node:retained', Dot.create('writer-1', 1));
    const replacementOp = new NodeAdd('node:replacement', Dot.create('writer-1', 2));
    const ops = [retainedOp];
    const reads = ['node:a'];
    const writes = ['node:b'];
    const patch = new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context: { 'writer-0': 1 },
      ops,
      reads,
      writes,
    });

    reads.push('node:c');
    writes.push('node:d');

    expect(Object.isFrozen(patch)).toBe(true);
    expect(patch.context).toEqual({ 'writer-0': 1 });
    expect(patch.ops).toEqual([retainedOp]);
    expect(patch.reads).toEqual(['node:a']);
    expect(patch.writes).toEqual(['node:b']);
    expect(Object.isFrozen(patch.context)).toBe(true);
    expect(Object.isFrozen(patch.ops)).toBe(true);
    expect(Object.isFrozen(patch.reads)).toBe(true);
    expect(Object.isFrozen(patch.writes)).toBe(true);
    expect(Reflect.set(patch.ops, '0', replacementOp)).toBe(false);
    expect(Reflect.set(patch.reads ?? [], '0', 'node:changed')).toBe(false);
    expect(Reflect.set(patch.writes ?? [], '0', 'node:changed')).toBe(false);
    expect(patch.ops).toEqual([retainedOp]);
  });

  it('clones VersionVector context input', () => {
    const context = VersionVector.empty();
    context.set('writer-1', 1);

    const patch = new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context,
      ops: [],
    });

    context.set('writer-1', 2);

    const patchContext = patch.context;
    expect(patchContext).toBeInstanceOf(VersionVector);
    if (!(patchContext instanceof VersionVector)) {
      throw new Error('expected VersionVector context');
    }
    expect(patchContext.get('writer-1')).toBe(1);
    expect(Object.isFrozen(patchContext)).toBe(true);
    expect(() => patchContext.set('writer-1', 9)).toThrowError(
      expect.objectContaining({ code: 'E_CRDT_FROZEN_MUTATION' }),
    );
    expect(patchContext.get('writer-1')).toBe(1);
  });

  it('rejects invalid schema, writer, lamport, and ops', () => {
    expect(() => new Patch({
      // @ts-expect-error exercising runtime validation.
      schema: 99,
      writer: 'writer-1',
      lamport: 1,
      context: {},
      ops: [],
    })).toThrow(PatchError);

    expect(() => new Patch({
      schema: 2,
      writer: '',
      lamport: 1,
      context: {},
      ops: [],
    })).toThrow(PatchError);

    expect(() => new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: -1,
      context: {},
      ops: [],
    })).toThrow(PatchError);

    expect(() => new Patch({
      schema: 2,
      writer: 'writer-1',
      lamport: 1,
      context: {},
      // @ts-expect-error exercising runtime validation.
      ops: null,
    })).toThrow(PatchError);
  });
});

function assertAdmissionMetadataIsReadonly(patch: Patch): void {
  // @ts-expect-error Retained entity-admission metadata is immutable.
  patch.entityAdmissions = [];
}

void assertAdmissionMetadataIsReadonly;
