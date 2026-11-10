import { ReservationCursor, type ReservationListUnavailable, type ReservationPage } from '@git-stunts/git-cas';
import { describe, expect, it } from 'vitest';
import CustodyAcknowledged from '../../../../src/domain/services/custody/CustodyAcknowledged.ts';
import CustodyEvidence from '../../../../src/domain/services/custody/CustodyEvidence.ts';
import RetentionStoreOpenError from '../../../../src/domain/errors/RetentionStoreOpenError.ts';
import CustodyIndeterminate from '../../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyInspection from '../../../../src/domain/services/custody/CustodyInspection.ts';
import CustodyRefused from '../../../../src/domain/services/custody/CustodyRefused.ts';
import ObservationAttemptId from '../../../../src/domain/services/custody/ObservationAttemptId.ts';
import ObservationCustodyIdentity from '../../../../src/domain/services/custody/ObservationCustodyIdentity.ts';
import ObservationCustodyPage from '../../../../src/domain/services/custody/ObservationCustodyPage.ts';
import ObservationCustodyRoots from '../../../../src/domain/services/custody/ObservationCustodyRoots.ts';
import ObservationDigest from '../../../../src/domain/services/custody/ObservationDigest.ts';
import EntropyObservationAttemptSource from '../../../../src/infrastructure/adapters/EntropyObservationAttemptSource.ts';
import GitCasObservationCustodyAdapter, {
  type ObservationReservationNamespace,
  type ObservationReservations,
} from '../../../../src/infrastructure/adapters/GitCasObservationCustodyAdapter.ts';
import ObservationCarrierMessage from '../../../../src/infrastructure/adapters/ObservationCarrierMessage.ts';
import NodeCryptoAdapter from '../../../../src/infrastructure/adapters/NodeCryptoAdapter.ts';
import WarpError from '../../../../src/domain/errors/WarpError.ts';
import { isObjectFault } from '../../../../src/infrastructure/adapters/ObservationObjectFault.ts';
import ObservationBasisFrontier, { type ObservationBasisHistory } from '../../../../src/infrastructure/adapters/ObservationBasisFrontier.ts';
import ObservationCarrierChain from '../../../../src/infrastructure/adapters/ObservationCarrierChain.ts';
import GitFastImportTreeWriter from '../../../../src/infrastructure/adapters/GitFastImportTreeWriter.ts';
import ObservationDependencyPages from '../../../../src/infrastructure/adapters/ObservationDependencyPages.ts';
import ObservationDependencyClaim from '../../../../src/domain/services/custody/ObservationDependencyClaim.ts';
import ObservationWorkMeter from '../../../../src/infrastructure/adapters/ObservationWorkMeter.ts';
import ObservationSupportLimits from '../../../../src/domain/services/custody/ObservationSupportLimits.ts';
import ObservationSupportFault from '../../../../src/domain/services/custody/ObservationSupportFault.ts';
import codec from '../../../../src/infrastructure/codecs/CborCodec.ts';
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
    cancel: unscripted, reconcile: unscripted, inspect: unscripted, readEvidence: unscripted, list: unscripted, ...handlers,
  };
}

async function adapterOver(handlers: Partial<ObservationReservationNamespace>): Promise<GitCasObservationCustodyAdapter> {
  const reservations: ObservationReservations = { open: async () => await Promise.resolve(namespaceWith(handlers)) };
  const opened = await GitCasObservationCustodyAdapter.open({ reservations, graphName: 'g', limit: 2, crypto: new NodeCryptoAdapter() });
  if (!(opened instanceof GitCasObservationCustodyAdapter)) {
    throw new Error('Scripted custody did not open');
  }
  return opened;
}

describe('reading what might be damaged', () => {
  const OID = 'ab'.repeat(20);
  const fatal = (stderr: string): Error => Object.assign(new Error('git failed'), { details: { code: 128, stderr } });
  const spawn = new Error('spawn git EAGAIN');
  const meter = (): ObservationWorkMeter => new ObservationWorkMeter(100);

  it('calls only an object Git refused to read a fault', () => {
    expect(isObjectFault(fatal('fatal: Not a valid object name'))).toBe(true);
    expect(isObjectFault(fatal('fatal: not a git repository'))).toBe(false);
    expect(isObjectFault(fatal('error: unable to open loose object: Permission denied\nfatal: git cat-file abc: bad file'))).toBe(false);
    expect(isObjectFault(fatal('fatal: git cat-file abc: bad file'))).toBe(false);
    expect(isObjectFault(fatal('fatal: loose object abc is corrupt'))).toBe(true);
    expect(isObjectFault(spawn)).toBe(false);
    expect(isObjectFault(Object.assign(new Error('bad tree'), { code: 'TREE_PARSE_ERROR' }))).toBe(true);
    expect(isObjectFault(Object.assign(new Error('Git failed'), { details: { code: 1, stderr: 'is corrupt' } }))).toBe(false);
  });

  it('keeps a transient failure reading a carrier out of the damage verdict', async () => {
    const chainOver = (failure: Error): ObservationCarrierChain => new ObservationCarrierChain({
      plumbing: { execute: async (options) => (options.args[1]?.startsWith('--batch-check') === true ? 'commit' : await Promise.reject(failure)) },
    }, new NodeCryptoAdapter());
    expect(await chainOver(fatal('fatal: loose object is corrupt')).walk(IDENTITY, OID, meter())).toEqual(new ObservationSupportFault('history-mismatch'));
    await expect(chainOver(spawn).walk(IDENTITY, OID, meter())).rejects.toBe(spawn);
  });

  it('keeps a transient failure reading a page out of the damage verdict', async () => {
    const pagesOver = (failure: Error): ObservationDependencyPages => new ObservationDependencyPages({
      history: {
        plumbing: { execute: async () => await Promise.resolve('tree') },
        readTreeObjectEntries: async () => await Promise.reject(failure),
      },
      trees: new GitFastImportTreeWriter({ plumbing: { execute: async () => await Promise.resolve('') } }),
      crypto,
      limits: new ObservationSupportLimits({ writers: 1, dependencies: 1, frontierBytes: 1, work: 100 }),
    });
    const claim = ObservationDependencyClaim.NONE;
    expect(await pagesOver(fatal('fatal: loose object is corrupt')).check([OID], claim, meter())).toBe('dependency-mismatch');
    await expect(pagesOver(spawn).check([OID], claim, meter())).rejects.toBe(spawn);
  });

  it('keeps a transient failure reading a basis out of the damage verdict', async () => {
    const frontierEntry = { name: 'frontier', mode: '100644', type: 'blob', oid: OID };
    const frontierOver = (overrides: Partial<ObservationBasisHistory>): ObservationBasisFrontier => new ObservationBasisFrontier({
      history: {
        plumbing: { execute: async (options) => await Promise.resolve(options.args[1] === '-s' ? '1' : 'tree') },
        readBlob: async () => await Promise.resolve(Uint8Array.of(0xff)),
        readTreeObjectEntries: async () => await Promise.resolve([frontierEntry]),
        ...overrides,
      },
      codec,
      limits: new ObservationSupportLimits({ writers: 1, dependencies: 1, frontierBytes: 10, work: 100 }),
    });
    const reject = async (failure: Error): Promise<never> => await Promise.reject(failure);
    const heads = async (overrides: Partial<ObservationBasisHistory>): Promise<readonly string[] | string> =>
      await frontierOver(overrides).heads(OID, meter());
    expect(await heads({})).toBe('corrupt');
    expect(await heads({ readTreeObjectEntries: async () => await reject(fatal('fatal: loose object is corrupt')) })).toBe('corrupt');
    await expect(heads({ readTreeObjectEntries: async () => await reject(spawn) })).rejects.toBe(spawn);
    expect(await heads({ readBlob: async () => await reject(fatal('fatal: loose object is corrupt')) })).toBe('corrupt');
    await expect(heads({ readBlob: async () => await reject(spawn) })).rejects.toBe(spawn);
    const sized = (failure: Error): Partial<ObservationBasisHistory> => ({
      plumbing: { execute: async (options) => (options.args[1] === '-s' ? await reject(failure) : 'tree') },
    });
    expect(await heads(sized(fatal('fatal: loose object is corrupt')))).toBe('corrupt');
    await expect(heads(sized(spawn))).rejects.toBe(spawn);
  });
});

describe('GitCasObservationCustodyAdapter', () => {
  it('pages through attempts, and ends on a store failure as uncertainty', async () => {
    const unavailable = new Error('ledger unavailable');
    const page = (records: readonly (typeof RECORD)[], next: ReservationCursor | null): ReservationPage => ({
      status: 'page', policy: POLICY, charged: records.length, revision: 'r', records, visitedNodes: 1, next,
    });
    const cursor = new ReservationCursor({ namespace: 'warp/g/observations', revision: 'a'.repeat(40), after: 'a'.repeat(64), phase: 'prepared' });
    const failed: ReservationListUnavailable = { status: 'unavailable', namespace: 'n', cursor, cause: unavailable };
    const pages = [page([RECORD], cursor), failed];
    const seen: object[] = [];
    const custody = await adapterOver({
      list: async (options) => {
        seen.push(options ?? {});
        return await Promise.resolve(pages[seen.length - 1] ?? failed);
      },
    });
    const listed: object[] = [];
    for await (const item of custody.attempts('prepared')) {
      listed.push(item);
    }
    expect(listed).toEqual([IDENTITY, new CustodyIndeterminate(unavailable)]);
    expect(seen).toEqual([{ phase: 'prepared', cursor: null }, { phase: 'prepared', cursor }]);
    const final = await adapterOver({ list: async () => await Promise.resolve(page([], null)) });
    expect((await final.attempts('prepared').next()).done).toBe(true);
    const thrown = await adapterOver({ list: async () => await Promise.reject(unavailable) });
    const iterator = thrown.attempts('armed');
    expect((await iterator.next()).value).toEqual(new CustodyIndeterminate(unavailable));
    expect((await iterator.next()).done).toBe(true);
    const odd = await adapterOver({ list: async () => await Promise.reject(Object.create(null)) });
    expect((await odd.attempts('armed').next()).value).toBeInstanceOf(CustodyIndeterminate);
  });

  it('opens a policy-bound namespace under the graph and maps refusal and uncertainty', async () => {
    let requested: object | null = null;
    const reservations: ObservationReservations = {
      open: async (options) => {
        requested = options;
        return await Promise.resolve({ status: 'refused', policy: POLICY, reason: 'policy-mismatch' });
      },
    };
    expect(await GitCasObservationCustodyAdapter.open({ reservations, graphName: 'g', limit: 2, crypto: new NodeCryptoAdapter() }))
      .toEqual(new CustodyRefused('policy-mismatch'));
    const namespace = await GitCasObservationCustodyAdapter.namespaceOf(new NodeCryptoAdapter(), 'g');
    expect(namespace).toMatch(/^warp\/[0-9a-f]{64}\/observations$/u);
    expect(requested).toEqual({ namespace, capacity: { unit: 'record-slot', limit: 2 } });
    const cause = new Error('open failed');
    const failing: ObservationReservations = {
      open: async () => await Promise.resolve({ status: 'indeterminate', policy: POLICY, cause }),
    };
    expect(await GitCasObservationCustodyAdapter.open({ reservations: failing, graphName: 'g', limit: 2, crypto: new NodeCryptoAdapter() }))
      .toEqual(new CustodyIndeterminate(cause));
  });

  it.each([
    ['a string', 'ledger offline', 'ledger offline'],
    ['nothing', undefined, 'undefined'],
  ])('keeps a store failure that is %s inside an Error, so the retention rejection can be built', async (_, thrown, described) => {
    // git-cas passes on whatever its store threw, so the value is read here without its declared type.
    const held: object = { thrown };
    const failing: ObservationReservations = {
      open: async () => await Promise.resolve({ status: 'indeterminate', policy: POLICY, cause: Reflect.get(held, 'thrown') }),
    };
    const failure = await GitCasObservationCustodyAdapter.open({ reservations: failing, graphName: 'g', limit: 2, crypto: new NodeCryptoAdapter() });
    if (!(failure instanceof CustodyIndeterminate)) {
      throw new Error('Expected an indeterminate open');
    }

    const rejection = new RetentionStoreOpenError(failure);

    expect(rejection.cause instanceof WarpError ? rejection.cause.context : 'not a WarpError').toEqual({ thrown });
    expect(rejection.message).toBe(`This graph's retention store did not open: the store could not answer (The reservation store failed with a value that is not an Error: ${described})`);
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
    execute: async ({ args, input }: { args: string[]; input?: string | Buffer }): Promise<string> => {
      if (args[1]?.startsWith('--batch-check') === true) {
        const oids = String(input).trim().split('\n');
        return await Promise.resolve(oids.map((oid) => (this.missing.has(oid) ? `${oid} missing` : 'commit')).join('\n'));
      }
      const raw = this.commits.get(args[2] ?? '') ?? '';
      this.peakHeadsRead = Math.max(this.peakHeadsRead, raw.split('\n').filter((line) => line.startsWith('parent ')).length);
      return await Promise.resolve(raw);
    },
  };

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
    expect(buildObservationConstructionRef('events', 'abc')).toBe('refs/warp-local/events/observations/construction/abc');
    expect(() => buildObservationConstructionRef('../events', 'abc')).toThrow();
    expect(() => buildObservationConstructionRef('events', '../abc')).toThrow(WarpError);
    expect(() => buildObservationConstructionRef('events', '')).toThrow(WarpError);
  });
});
