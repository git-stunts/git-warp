import { describe, expect, it } from 'vitest';
import CustodyAcknowledged from '../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import CustodyEvidence from '../../../../src/domain/services/custody/CustodyEvidence.ts';
import CustodyIndeterminate from '../../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyInspection from '../../../../src/domain/services/custody/CustodyInspection.ts';
import CustodyRefused from '../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyPage from '../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import ObservationSupportFault from '../../../../src/domain/services/custody/ObservationSupportFault.ts';
import EntropyObservationAttemptSource from '../../../../src/infrastructure/adapters/EntropyObservationAttemptSource.ts';
import GitCasObservationCustodyAdapter, {
  type ObservationReservationNamespace,
  type ObservationReservations,
} from '../../../../src/infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import ObservationCarrierChain from '../../../../src/infrastructure/adapters/ObservationCarrierChain.ts';
import ObservationCarrierMessage from '../../../../src/infrastructure/adapters/ObservationCarrierMessage.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import ObservationWorkMeter from '../../../../src/infrastructure/adapters/ObservationWorkMeter.ts';
import { buildObservationConstructionRef } from '../../../../src/domain/utils/ObservationRefLayout.ts';
import { narrowed } from '../../../helpers/ObservationCustodyFixture.ts';

const BINDING = new ObservationDigest('ab'.repeat(32));
const FOREIGN = new ObservationDigest('cd'.repeat(32));
const IDENTITY = new ObservationCustodyIdentity(new ObservationAttemptId('0'.repeat(32)), BINDING);
const PAGE = new ObservationCustodyPage(Uint8Array.of(1), new ObservationCustodyRoots([], []));
const WIRE = { key: IDENTITY.attemptId.value, binding: BINDING.hex };
const RECORD = { ...WIRE, phase: 'prepared', preparation: null, settlement: null, charge: 1 } as const;
const ARMED = { ...RECORD, phase: 'armed' } as const;
const SETTLED = { ...RECORD, phase: 'settled' } as const;
const POLICY = { namespace: 'warp/g/observations', unit: 'record-slot', limit: 2 } as const;
const crypto = new NodeCryptoAdapter();

function unscripted(): Promise<never> {
  return Promise.reject(new Error('Unscripted reservation operation'));
}

function namespaceWith(handlers: Partial<ObservationReservationNamespace>): ObservationReservationNamespace {
  return {
    status: 'opened', reserve: unscripted, prepare: unscripted, arm: unscripted, settle: unscripted,
    cancel: unscripted, reconcile: unscripted, inspect: unscripted, readEvidence: unscripted, ...handlers,
  };
}

async function adapterOver(handlers: Partial<ObservationReservationNamespace>): Promise<GitCasObservationCustodyAdapter> {
  const reservations: ObservationReservations = { open: async () => await Promise.resolve(namespaceWith(handlers)) };
  const opened = await GitCasObservationCustodyAdapter.open({ reservations, graphName: 'g', limit: 2 });
  if (!(opened instanceof GitCasObservationCustodyAdapter)) {
    throw new Error('Scripted custody did not open');
  }
  return opened;
}

describe('GitCasObservationCustodyAdapter', () => {
  it('opens a policy-bound namespace under the graph and maps refusal and uncertainty', async () => {
    let requested: object | null = null;
    const reservations: ObservationReservations = {
      open: async (options) => {
        requested = options;
        return await Promise.resolve({ status: 'refused', policy: POLICY, reason: 'policy-mismatch' });
      },
    };
    expect(await GitCasObservationCustodyAdapter.open({ reservations, graphName: 'g', limit: 2 }))
      .toEqual(new CustodyRefused('policy-mismatch'));
    expect(requested).toEqual({ namespace: 'warp/g/observations', capacity: { unit: 'record-slot', limit: 2 } });
    const cause = new Error('open failed');
    const failing: ObservationReservations = {
      open: async () => await Promise.resolve({ status: 'indeterminate', policy: POLICY, cause }),
    };
    expect(await GitCasObservationCustodyAdapter.open({ reservations: failing, graphName: 'g', limit: 2 }))
      .toEqual(new CustodyIndeterminate(cause));
  });

  it('maps every lifecycle status from the store, with exact evidence fields', async () => {
    let evidence: object | null = null;
    const adapter = await adapterOver({
      reserve: async () => await Promise.resolve({ status: 'admitted', record: RECORD, revision: 'r' }),
      prepare: async (options) => {
        evidence = options;
        return await Promise.resolve({ status: 'prepared', record: RECORD, revision: 'r' });
      },
      arm: async () => await Promise.resolve({ status: 'armed', record: ARMED, revision: 'r' }),
      settle: async () => await Promise.resolve({ status: 'recovered', record: SETTLED, revision: 'r' }),
      cancel: async () => await Promise.resolve({ status: 'refused', reason: 'irreversible', ...WIRE }),
      reconcile: async () => await Promise.resolve({ status: 'indeterminate', cause: new Error('x'), ...WIRE }),
    });
    expect(await adapter.reserve(IDENTITY)).toEqual(new CustodyAcknowledged('admitted', 'prepared'));
    expect(await adapter.prepare(IDENTITY, PAGE)).toEqual(new CustodyAcknowledged('prepared', 'prepared'));
    expect(evidence).toMatchObject({ ...WIRE, evidence: { supports: [], parents: [] } });
    expect(await adapter.arm(IDENTITY)).toEqual(new CustodyAcknowledged('armed', 'armed'));
    expect(await adapter.settle(IDENTITY, PAGE)).toEqual(new CustodyAcknowledged('recovered', 'settled'));
    expect(await adapter.cancel(IDENTITY)).toEqual(new CustodyRefused('irreversible'));
    expect(await adapter.reconcile(IDENTITY)).toBeInstanceOf(CustodyIndeterminate);
  });

  it('maps inspection and evidence reads', async () => {
    const adapter = await adapterOver({
      inspect: async () => await Promise.resolve({ status: 'inspected', record: RECORD, charged: 1, policy: POLICY, revision: 'r', custody: null }),
      readEvidence: async () => await Promise.resolve({
        status: 'read',
        attempt: RECORD,
        ledgerRevision: 'l',
        stage: 'preparation',
        custodyRevision: 'c',
        evidence: { record: Uint8Array.of(7), roots: { supports: [], parents: [] } },
      }),
    });
    expect(await adapter.inspect(IDENTITY)).toEqual(new CustodyInspection({ phase: 'prepared', charged: 1, limit: 2 }));
    const read = narrowed(await adapter.readEvidence(IDENTITY, 'preparation'), CustodyEvidence);
    expect(read.page.record()).toEqual(Uint8Array.of(7));

    const refusing = await adapterOver({
      inspect: async () => await Promise.resolve({ status: 'refused', reason: 'not-reserved', ...WIRE }),
      readEvidence: async () => await Promise.resolve({ status: 'indeterminate', cause: new Error('x'), ...WIRE }),
    });
    expect(await refusing.inspect(IDENTITY)).toEqual(new CustodyRefused('not-reserved'));
    expect(await refusing.readEvidence(IDENTITY, 'settlement')).toBeInstanceOf(CustodyIndeterminate);
  });

  it('treats a thrown store failure as indeterminate, never as absence', async () => {
    const cause = new Error('thrown');
    const adapter = await adapterOver({
      reserve: async () => await Promise.reject(cause),
      inspect: async () => await Promise.reject('text failure'),
    });
    expect(await adapter.reserve(IDENTITY)).toEqual(new CustodyIndeterminate(cause));
    expect(await adapter.inspect(IDENTITY)).toBeInstanceOf(CustodyIndeterminate);
  });
});

describe('ObservationCarrierMessage', () => {
  const message = new ObservationCarrierMessage({ binding: BINDING, sequence: 2, writers: 70, history: FOREIGN });

  it('round-trips, tolerating the newline Git may trim', () => {
    expect(ObservationCarrierMessage.parse(message.toString())?.toString()).toBe(message.toString());
    expect(ObservationCarrierMessage.parse(message.toString().trimEnd())?.sequence).toBe(2);
  });

  it.each([
    ['another message', 'ordinary commit'],
    ['another version', message.toString().replace('version 1', 'version 2')],
    ['a surplus line', `${message.toString()}extra\n`],
    ['a malformed digest', message.toString().replace(BINDING.hex, 'xyz')],
  ])('refuses %s', (_name, text) => {
    expect(ObservationCarrierMessage.parse(text)).toBeNull();
  });
});

/** A fake history of raw commit objects, and a chain builder that claims honestly unless told to lie. */
class CarrierHistory {
  readonly commits = new Map<string, string>();
  readonly missing = new Set<string>();
  readonly #chain: ObservationCarrierChain;
  #next = 0;
  peakHeadsRead = 0;

  constructor() {
    this.#chain = new ObservationCarrierChain(this, crypto);
  }

  get chain(): ObservationCarrierChain {
    return this.#chain;
  }

  readonly plumbing = {
    execute: async ({ args }: { args: string[] }): Promise<string> => {
      const raw = this.commits.get(args[2] ?? '') ?? '';
      this.peakHeadsRead = Math.max(this.peakHeadsRead, raw.split('\n').filter((line) => line.startsWith('parent ')).length);
      return await Promise.resolve(raw);
    },
  };

  async nodeExists(oid: string): Promise<boolean> {
    return await Promise.resolve(!this.missing.has(oid));
  }

  oid(): string {
    this.#next += 1;
    return String(this.#next).padStart(40, '0');
  }

  store(parents: readonly string[], message: string): string {
    const oid = this.oid();
    this.commits.set(oid, ['tree 0', ...parents.map((parent) => `parent ${parent}`), 'author a', '', message].join('\n'));
    return oid;
  }

  /** Builds a chain of honest carriers over batches of `size` fresh heads. */
  async honest(batches: number, size: number): Promise<{ readonly tip: string; readonly heads: readonly (readonly string[])[] }> {
    let previous: string | null = null;
    let history = await this.#chain.seed();
    let writers = 0;
    const heads: string[][] = [];
    for (let sequence = 1; sequence <= batches; sequence++) {
      const batch = Array.from({ length: size }, () => this.oid());
      heads.push(batch);
      history = await this.#chain.extend(history, batch);
      writers += size;
      const claim = new ObservationCarrierMessage({ binding: BINDING, sequence, writers, history });
      previous = this.store(previous === null ? batch : [previous, ...batch], claim.toString());
    }
    return { tip: previous ?? '', heads };
  }
}

describe('ObservationCarrierChain', () => {
  it('walks an honest chain to its claimed position, reading one batch at a time', async () => {
    const history = new CarrierHistory();
    const { tip } = await history.honest(4, 63);
    expect(await history.chain.walk(IDENTITY, tip, unbounded())).toMatchObject({ tip, sequence: 4, writers: 252 });
    expect(history.peakHeadsRead).toBe(64);
  });

  it('reports a missing carrier or a missing retained head', async () => {
    const history = new CarrierHistory();
    const { tip, heads } = await history.honest(2, 3);
    history.missing.add(heads[0]?.[1] ?? '');
    expect(await history.chain.walk(IDENTITY, tip, unbounded())).toEqual(new ObservationSupportFault('history-missing'));
    expect(await new CarrierHistory().chain.walk(IDENTITY, tip, unbounded())).toEqual(new ObservationSupportFault('history-mismatch'));
    const gone = new CarrierHistory();
    const chain = await gone.honest(2, 1);
    gone.missing.add(chain.tip);
    expect(await gone.chain.walk(IDENTITY, chain.tip, unbounded())).toEqual(new ObservationSupportFault('history-missing'));
  });

  it('refuses another attempt\'s carrier and a foreign commit', async () => {
    const history = new CarrierHistory();
    const { tip } = await history.honest(1, 2);
    const other = new ObservationCustodyIdentity(IDENTITY.attemptId, FOREIGN);
    expect(await history.chain.walk(other, tip, unbounded())).toEqual(new ObservationSupportFault('history-mismatch'));
    expect(await history.chain.walk(IDENTITY, history.store([], 'ordinary commit'), unbounded())).toEqual(new ObservationSupportFault('history-mismatch'));
    const earlier = history.store([], new ObservationCarrierMessage({ binding: FOREIGN, sequence: 1, writers: 0, history: BINDING }).toString());
    const later = history.store([earlier], new ObservationCarrierMessage({ binding: BINDING, sequence: 2, writers: 0, history: BINDING }).toString());
    expect(await history.chain.walk(IDENTITY, later, unbounded())).toEqual(new ObservationSupportFault('history-mismatch'));
  });

  it.each([
    ['an inflated writer count', { writers: 99 }],
    ['a skipped sequence', { sequence: 5 }],
    ['a forged digest', { history: FOREIGN }],
  ])('refuses a later carrier with %s', async (_name, lie) => {
    const history = new CarrierHistory();
    const { tip, heads } = await history.honest(1, 2);
    const batch = [history.oid()];
    const claim = new ObservationCarrierMessage({
      binding: BINDING,
      sequence: 2,
      writers: 3,
      history: await history.chain.extend(await firstDigest(history, heads[0] ?? []), batch),
      ...lie,
    });
    const forged = history.store([tip, ...batch], claim.toString());
    expect(await history.chain.walk(IDENTITY, forged, unbounded())).toEqual(new ObservationSupportFault('history-mismatch'));
  });

  it.each([
    ['a wrong count', { writers: 9 }],
    ['a forged digest', { history: FOREIGN }],
  ])('refuses a first carrier with %s', async (_name, lie) => {
    const history = new CarrierHistory();
    const batch = [history.oid(), history.oid()];
    const claim = new ObservationCarrierMessage({
      binding: BINDING, sequence: 1, writers: 2, history: await firstDigest(history, batch), ...lie,
    });
    expect(await history.chain.walk(IDENTITY, history.store(batch, claim.toString()), unbounded()))
      .toEqual(new ObservationSupportFault('history-mismatch'));
  });

  it('accepts a later carrier honest about its predecessor as control', async () => {
    const history = new CarrierHistory();
    const { tip, heads } = await history.honest(1, 2);
    const batch = [history.oid()];
    const claim = new ObservationCarrierMessage({
      binding: BINDING, sequence: 2, writers: 3, history: await history.chain.extend(await firstDigest(history, heads[0] ?? []), batch),
    });
    expect(await history.chain.walk(IDENTITY, history.store([tip, ...batch], claim.toString()), unbounded())).toMatchObject({ sequence: 2, writers: 3 });
  });

  it('reports a later carrier with no parents as a broken chain', async () => {
    const history = new CarrierHistory();
    const claim = new ObservationCarrierMessage({ binding: BINDING, sequence: 2, writers: 0, history: await history.chain.seed() });
    expect(await history.chain.walk(IDENTITY, history.store([], claim.toString()), unbounded())).toEqual(new ObservationSupportFault('history-mismatch'));
  });

  it('stops at its work bound, at a carrier or at its heads', async () => {
    const history = new CarrierHistory();
    const { tip } = await history.honest(2, 3);
    expect(await history.chain.walk(IDENTITY, tip, new ObservationWorkMeter(0))).toEqual(new ObservationSupportFault('work-limit'));
    expect(await history.chain.walk(IDENTITY, tip, new ObservationWorkMeter(2))).toEqual(new ObservationSupportFault('work-limit'));
    expect(await history.chain.walk(IDENTITY, tip, new ObservationWorkMeter(5))).toEqual(new ObservationSupportFault('work-limit'));
    expect(await history.chain.walk(IDENTITY, tip, new ObservationWorkMeter(8))).toMatchObject({ writers: 6 });
  });

  it('starts empty', async () => {
    expect(await new CarrierHistory().chain.empty()).toMatchObject({ tip: null, sequence: 0, writers: 0 });
  });
});

function unbounded(): ObservationWorkMeter {
  return new ObservationWorkMeter(Number.MAX_SAFE_INTEGER);
}

async function firstDigest(history: CarrierHistory, heads: readonly string[]): Promise<ObservationDigest> {
  return await history.chain.extend(await history.chain.seed(), heads);
}

describe('observation host boundaries', () => {
  it('mints distinct canonical attempt identifiers', () => {
    const source = new EntropyObservationAttemptSource();
    const minted = new Set(Array.from({ length: 16 }, () => source.next().value));
    expect(minted.size).toBe(16);
  });

  it('names construction refs under the graph and validates it', () => {
    expect(buildObservationConstructionRef('events', 'abc')).toBe('refs/warp/events/observations/construction/abc');
    expect(() => buildObservationConstructionRef('../events', 'abc')).toThrow();
  });
});
