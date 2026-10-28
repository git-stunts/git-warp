import { describe, expect, it } from 'vitest';

import EntityAdmissionInventoryCertificate from '../../../src/domain/api/EntityAdmissionInventoryCertificate.ts';
import {
  bindEntityAdmissionInventoryCertificate,
  bindEntityAdmissionInventoryContinuation,
  findEntityAdmissionInventoryContinuation,
} from '../../../src/domain/api/EntityAdmissionInventoryCertificateRuntime.ts';
import EntityAdmissionInventoryCursor from '../../../src/domain/api/EntityAdmissionInventoryCursor.ts';
import {
  createEntityAdmissionInventoryObserver,
  ENTITY_ADMISSION_INVENTORY_DEFAULT_LIMIT,
  ENTITY_ADMISSION_INVENTORY_MAX_LIMIT,
  requireEntityAdmissionInventoryPaging,
} from '../../../src/domain/api/EntityAdmissionInventoryObserverRuntime.ts';
import ObservationReceipt from '../../../src/domain/api/ObservationReceipt.ts';
import Observer from '../../../src/domain/api/Observer.ts';
import Tick from '../../../src/domain/api/Tick.ts';

const EVIDENCE = Object.freeze({
  basis: Object.freeze({ id: 'basis:inventory' }),
  support: Object.freeze([]),
  tick: new Tick({ id: 'basis:inventory', timeline: 'captures' }),
});

function cursor(remaining: ReadonlyMap<string, number> = new Map([['b,=w', 2], ['a', 0]])): EntityAdmissionInventoryCursor {
  return new EntityAdmissionInventoryCursor({
    lane: 'cap|tures', basisId: 'tick:1', admissionCount: 7, streamDigest: 'digest:1', remaining,
  });
}

function completedReceipt(observer: Observer, evidence: ObservationReceipt['evidence'] = EVIDENCE): ObservationReceipt {
  return new ObservationReceipt({ evidence: evidence ?? EVIDENCE, lane: 'captures', observer, status: 'completed', writer: 'w' });
}

describe('entity admission inventory paging (#1039)', () => {
  it('round-trips a cursor whose parts hold separators, with its check digest', () => {
    const text = cursor().encode('check|1');
    const parsed = EntityAdmissionInventoryCursor.parse(text);
    expect(parsed.check).toBe('check|1');
    expect(parsed.cursor).toEqual(cursor());
    expect([...parsed.cursor.remaining.keys()]).toEqual(['a', 'b,=w']);
    expect(EntityAdmissionInventoryCursor.parse(cursor(new Map()).encode('c')).cursor.remaining).toEqual(new Map());
  });

  it('refuses malformed cursors', () => {
    const good = cursor().encode('c');
    for (const bad of [
      'not a cursor',
      good.replace('|7|', '|07|'),
      good.replace('|7|', '|-1|'),
      `${good}|extra`,
      good.replace('tick%3A1', '%E0%A4%A'),
      good.slice(0, good.lastIndexOf('|') + 1),
    ]) {
      expect(() => EntityAdmissionInventoryCursor.parse(bad), bad).toThrowError(
        expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CURSOR' }),
      );
    }
    // @ts-expect-error Exercise the JavaScript boundary with a non-string cursor.
    expect(() => EntityAdmissionInventoryCursor.parse(42)).toThrowError(expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CURSOR' }));
    expect(() => new EntityAdmissionInventoryCursor({ ...cursor(), remaining: new Map([['a', 1.5]]) })).toThrow('malformed count');
    // @ts-expect-error Exercise the JavaScript boundary with non-Map positions.
    expect(() => new EntityAdmissionInventoryCursor({ ...cursor(), remaining: {} })).toThrow('must be a Map');
  });

  it('declares a bounded default limit and validates limits and cursors', () => {
    const plain = createEntityAdmissionInventoryObserver('all');
    expect(requireEntityAdmissionInventoryPaging(plain)).toEqual({ limit: ENTITY_ADMISSION_INVENTORY_DEFAULT_LIMIT, resume: null });
    const resumed = createEntityAdmissionInventoryObserver('next', { limit: 5, cursor: cursor().encode('c') });
    expect(requireEntityAdmissionInventoryPaging(resumed).limit).toBe(5);
    expect(requireEntityAdmissionInventoryPaging(resumed).resume?.cursor.admissionCount).toBe(7);
    for (const limit of [0, 1.5, ENTITY_ADMISSION_INVENTORY_MAX_LIMIT + 1]) {
      expect(() => createEntityAdmissionInventoryObserver('bad', { limit })).toThrowError(
        expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_PAGING' }),
      );
    }
    // @ts-expect-error Exercise the JavaScript boundary with null options.
    expect(() => createEntityAdmissionInventoryObserver('bad', null)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_PAGING' }),
    );
    const other = new Observer({ cardinality: 'many', decode: (value) => value, id: 'other' });
    expect(() => requireEntityAdmissionInventoryPaging(other)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_OBSERVER' }),
    );
  });

  it('binds one continuation or one certificate to a completed inventory receipt', () => {
    const observer = createEntityAdmissionInventoryObserver('all');
    const paged = completedReceipt(observer);
    expect(findEntityAdmissionInventoryContinuation(paged)).toBeNull();
    bindEntityAdmissionInventoryContinuation(paged, 'cursor:1');
    expect(findEntityAdmissionInventoryContinuation(paged)).toBe('cursor:1');
    expect(() => bindEntityAdmissionInventoryContinuation(paged, 'cursor:2')).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE' }),
    );
    const certificate = new EntityAdmissionInventoryCertificate({
      admissionCount: 1, basisId: 'basis:inventory', causalDomainId: 'domain', evidence: EVIDENCE,
      lane: { kind: 'worldline', name: 'captures' }, selectorDigest: 'selector', streamDigest: 'stream',
    });
    expect(() => bindEntityAdmissionInventoryCertificate(paged, certificate)).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE' }),
    );
    const certified = completedReceipt(observer, certificate.evidence);
    bindEntityAdmissionInventoryCertificate(certified, certificate);
    expect(() => bindEntityAdmissionInventoryContinuation(certified, 'cursor:3')).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE' }),
    );
    // @ts-expect-error Exercise the JavaScript boundary.
    expect(() => findEntityAdmissionInventoryContinuation({})).toThrowError(
      expect.objectContaining({ code: 'E_ENTITY_ADMISSION_INVENTORY_CERTIFICATE' }),
    );
  });
});
