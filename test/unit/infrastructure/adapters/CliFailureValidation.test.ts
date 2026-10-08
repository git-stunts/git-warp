import { describe, expect, it } from 'vitest';
import CliFailureCode from '../../../../src/infrastructure/adapters/CliFailureCode.ts';
import CliFailureExitCode from '../../../../src/infrastructure/adapters/CliFailureExitCode.ts';
import CliFailureNode from '../../../../src/infrastructure/adapters/CliFailureNode.ts';
import CliFailureReport from '../../../../src/infrastructure/adapters/CliFailureReport.ts';
import CliFailureTraversal from '../../../../src/infrastructure/adapters/CliFailureTraversal.ts';
import CliFailureRedactorAdapter from '../../../../src/infrastructure/adapters/CliFailureRedactorAdapter.ts';
import CliFailureProjectionAdapter from '../../../../src/infrastructure/adapters/CliFailureProjectionAdapter.ts';
import {
  aggregateMembers, boundedEntries, safeLength, secondaryMembers, aggregateOverflow,
} from '../../../../src/infrastructure/adapters/CliFailurePropertyReader.ts';
import { CliError } from '../../../../bin/cli/infrastructure.ts';

const redactor = new CliFailureRedactorAdapter({ home: '', directory: '' });
const projector = new CliFailureProjectionAdapter({
  classifier: { isCliError: (error) => error instanceof CliError }, redactor,
});
const primary = new CliFailureNode({ code: 'E_USAGE', message: 'Primary', relation: 'cause' });

describe('CLI failure runtime validation', () => {
  it('refuses malformed codes, messages and false-success statuses', () => {
    expect(() => new CliFailureCode('invalid')).toThrowError();
    // @ts-expect-error -- #978: exercise the constructor's runtime string gate.
    expect(() => new CliFailureCode(12)).toThrowError();
    for (const status of [0, -1, 256, 1.5]) {
      expect(() => new CliFailureExitCode(status)).toThrowError();
    }
    expect(() => new CliFailureNode({ code: 'E_USAGE', message: 'x'.repeat(1025), relation: 'cause' })).toThrowError();
    expect(() => new CliFailureNode({
      code: 'E_USAGE', message: 'Primary',
      // @ts-expect-error -- #978: invalid decoded edge labels must be refused at runtime.
      relation: 'invalid',
    })).toThrowError();
    expect(() => new CliFailureNode({
      code: 'E_USAGE', message: 'Primary', relation: 'cause',
      // @ts-expect-error -- #978: completeness metadata is a runtime boolean.
      truncated: 'yes',
    })).toThrowError();
    expect(() => new CliFailureNode({
      code: 'E_USAGE', message: 'Primary', relation: 'cause',
      // @ts-expect-error -- #978: decoded dictionaries cannot impersonate display nodes.
      causes: [{}],
    })).toThrowError();
    expect(() => new CliFailureReport({
      // @ts-expect-error -- #978: a report requires a constructed, validated primary node.
      primary: {}, code: 'E_USAGE', exitCode: 1,
    })).toThrowError();
    expect(() => new CliFailureReport({
      primary, code: 'E_USAGE', exitCode: 1,
      // @ts-expect-error -- #978: cleanup dictionaries are not display nodes.
      cleanup: [{}],
    })).toThrowError();
  });

  it('bounds malformed provider arrays without reading arbitrary values', () => {
    expect(aggregateMembers(new Error('Plain'))).toEqual([]);
    for (const value of [null, undefined, 3, {}, { length: -1 }, { length: 1.5 }, { length: 'PRIVATE' }]) {
      expect(safeLength(value)).toBe(0);
      expect(boundedEntries(value)).toEqual([]);
    }
    const empty = new AggregateError([], 'Empty');
    expect(projector.project(empty).primary.message).toBe('Empty');
    Object.defineProperty(empty, 'errors', { value: null });
    expect(projector.project(empty).exitCode).toBe(3);
  });

  it('terminates aggregate cycles and retains malformed-status refusal', () => {
    const cycle = new AggregateError([], 'Aggregate cycle');
    Object.defineProperty(cycle, 'errors', { value: [cycle] });
    expect(projector.project(cycle).truncated).toBe(true);
    expect(secondaryMembers(cycle)).toEqual([]);
    expect(aggregateOverflow(cycle)).toBe(false);
    const error = new CliError('Failed', { code: 'E_USAGE', exitCode: 0 });
    expect(projector.project(error).exitCode).toBe(3);
    Object.defineProperty(error, 'code', { value: 'not a machine code' });
    expect(projector.project(error).code).toBe('E_INTERNAL');
  });

  it('marks omitted secondary roots and later edges in a shared budget', () => {
    const wide = new AggregateError(Array.from({ length: 20 }, () => new Error('Member')), 'Wide');
    const error = new Error('Primary', { cause: wide });
    Object.defineProperty(error, 'meta', { value: { originalError: new Error('Last edge') } });
    expect(projector.project(error, new Error('Cleanup')).truncated).toBe(true);
    const traversal = new CliFailureTraversal(redactor);
    const children: CliFailureNode[] = [];
    for (let index = 0; index < 9; index++) {
      traversal.appendRoot(children, new Error('Bounded root'), 'cleanup');
    }
    expect(children).toHaveLength(8);
    expect(traversal.truncated).toBe(true);
  });
});
