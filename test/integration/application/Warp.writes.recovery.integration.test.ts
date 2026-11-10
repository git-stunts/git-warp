import { afterEach, describe, expect, it } from 'vitest';
import { intent } from '../../../advanced.ts';
import { execFileSync } from 'node:child_process';
import { IndeterminateWriteReceipt, UnretainedWriteReceipt, type AuthoredWriteReceipt, type Warp } from '../../../index.ts';
import WarpError from '../../../src/domain/errors/WarpError.ts';
import CustodyIndeterminate from '../../../src/domain/services/custody/CustodyIndeterminate.ts';
import CustodyRefused from '../../../src/domain/services/custody/CustodyRefused.ts';
import codec from '../../../src/infrastructure/codecs/CborCodec.ts';
import type CodecValue from '../../../src/domain/types/codec/CodecValue.ts';
import type ObservationCustodyPort from '../../../src/ports/ObservationCustodyPort.ts';
import { GRAPH, attemptRefs, disposeWarpFixtures, git, open, repository, retained, unseen } from '../../helpers/WarpWriteFixture.ts';
import WriteRecoveryCustody from '../../helpers/WriteRecoveryCustody.ts';
import WriteAttemptJournalCapture from '../../helpers/WriteAttemptJournalCapture.ts';
import { narrowed } from '../../helpers/ObservationCustodyFixture.ts';

/**
 * Option (i) of #1072: recovery builds a receipt from the record's races only when custody
 * positively holds no settlement, or its retained core matched the record byte for byte.
 * Every other outcome answers indeterminate and keeps the record.
 */
afterEach(async () => {
  await disposeWarpFixtures();
});

/** Recovery here never reads time, but the Warp still gets a fixed clock. */
const clock = (): number => 1_000_000;
const MALLORY = [['register', 'doc', 'title', ['mallory'], 0, 'underdetermined']];
const unavailable = (): CustodyIndeterminate => new CustodyIndeterminate(new Error('store went away'));

/** Real git-cas custody, except the answers given here for a settlement read and for `settle`. */
function custodyAnswering(answers: {
  readonly settlement?: () => CustodyIndeterminate;
  readonly settle?: () => CustodyIndeterminate | CustodyRefused;
}): (custody: ObservationCustodyPort) => ObservationCustodyPort {
  return (custody) => new WriteRecoveryCustody(custody, answers);
}

/** Alice's first write, then Bob's write she never observed, so her next title write races `["bob"]`. */
async function seeded(path: string): Promise<void> {
  const warp = await open(path, { clock });
  retained(await warp.as('alice').execute([intent.node.add({ subject: 'doc' }), intent.property.set({ subject: 'doc', key: 'title', value: 'one' })]));
  await warp.close();
  await unseen(path, 'bob', (patch) => { patch.setProperty('doc', 'title', 'unseen'); });
}

async function raced(warp: Warp): Promise<AuthoredWriteReceipt> {
  const receipt = await warp.as('alice').execute(intent.property.set({ subject: 'doc', key: 'title', value: 'two' }));
  await warp.close();
  return receipt;
}

/** A plural write custody settled with races `["bob"]`, whose record outlived it. */
async function settledWithRecord(path: string): Promise<string> {
  await seeded(path);
  let captured: WriteAttemptJournalCapture | null = null;
  const warp = await open(path, {
    clock, wrapCustody: (custody) => { captured = new WriteAttemptJournalCapture(custody, path, GRAPH); return captured; },
  });
  retained(await raced(warp));
  const { records } = narrowed(captured, WriteAttemptJournalCapture);
  expect(records.size).toBe(1);
  expect(attemptRefs(path)).toEqual([]);
  for (const [ref, oid] of records) {
    git(path, ['update-ref', ref, oid]);
  }
  return attemptRefs(path)[0] ?? '';
}

/** A plural write that published, whose `settle` never reached custody. */
async function unsettled(path: string): Promise<string> {
  await seeded(path);
  const receipt = await raced(await open(path, { clock, wrapCustody: custodyAnswering({ settle: unavailable }) }));
  if (!(receipt instanceof UnretainedWriteReceipt) || receipt.attempt === null) {
    throw new Error('Expected a repeatable unretained receipt');
  }
  return attemptRefs(path)[0] ?? '';
}

/** Rewrites the saved record, as a corrupt or altered ref would. */
function rewrite(path: string, ref: string, fields: { readonly [field: string]: CodecValue }): void {
  const stored = codec.decode(execFileSync('git', ['cat-file', 'blob', git(path, ['rev-parse', ref])], { cwd: path }));
  if (stored === null || typeof stored !== 'object') {
    throw new Error('The journal did not encode a record');
  }
  const written = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: path, input: codec.encode({ ...stored, ...fields }) });
  git(path, ['update-ref', ref, written.toString().trim()]);
}

async function asked(warp: Warp, ref: string) {
  return await warp.as('alice').reconcile(ref.split('/').at(-1) ?? '').then(
    (receipt) => ({
      receipt: receipt?.constructor.name ?? null,
      races: receipt !== null && 'outcome' in receipt ? receipt.outcome.races.map(({ writers }) => [...writers]) : null,
    }),
    (error: Error) => ({ error: error instanceof WarpError ? error.code : error.message }),
  );
}

const MISMATCH = { error: 'E_WRITE_CORE_MISMATCH' };
const INDETERMINATE = { receipt: IndeterminateWriteReceipt.name, races: null };

describe('recovery of a write whose settlement custody may hold', () => {
  it('control: refuses an altered record when custody can be read, and keeps it', async () => {
    const path = await repository();
    const ref = await settledWithRecord(path);
    rewrite(path, ref, { races: MALLORY });

    expect(await asked(await open(path, { clock, wrapCustody: custodyAnswering({}) }), ref)).toEqual(MISMATCH);
    expect(attemptRefs(path)).toEqual([ref]);
  });

  it('keeps an altered record through a sweep that cannot read the settlement', async () => {
    const path = await repository();
    const ref = await settledWithRecord(path);
    rewrite(path, ref, { races: MALLORY });

    await open(path, { clock, wrapCustody: custodyAnswering({ settlement: unavailable }) });

    expect(attemptRefs(path)).toEqual([ref]);
  });

  it.each([
    ['custody conflicts', {}],
    ['settle is indeterminate', { settle: unavailable }],
  ])('answers indeterminate for an altered record whose settlement cannot be read when %s', async (_, answers) => {
    const path = await repository();
    const ref = await settledWithRecord(path);
    rewrite(path, ref, { races: MALLORY, reported: true });

    expect(await asked(await open(path, { clock, wrapCustody: custodyAnswering({ settlement: unavailable, ...answers }) }), ref)).toEqual(INDETERMINATE);
    expect(attemptRefs(path)).toEqual([ref]);
    expect(await asked(await open(path, { clock }), ref)).toEqual(MISMATCH);
  });

  it('honest control: an unaltered record waits for a readable settlement, then is retained', async () => {
    const path = await repository();
    const ref = await settledWithRecord(path);
    rewrite(path, ref, { reported: true });

    expect(await asked(await open(path, { clock, wrapCustody: custodyAnswering({ settlement: unavailable }) }), ref)).toEqual(INDETERMINATE);
    expect(attemptRefs(path)).toEqual([ref]);
    expect(await asked(await open(path, { clock, wrapCustody: custodyAnswering({}) }), ref)).toEqual({ receipt: 'RetainedWriteReceipt', races: [['bob']] });
    expect(attemptRefs(path)).toEqual([]);
  });
});

describe('recovery of a write custody reports not settled', () => {
  it('answers indeterminate when settle reports a conflict, and keeps the record', async () => {
    const path = await repository();
    const ref = await unsettled(path);
    const conflict = (): CustodyRefused => new CustodyRefused('settlement-mismatch');

    expect(await asked(await open(path, { clock, wrapCustody: custodyAnswering({ settle: conflict }) }), ref)).toEqual(INDETERMINATE);
    expect(attemptRefs(path)).toEqual([ref]);
    expect(await asked(await open(path, { clock, wrapCustody: custodyAnswering({}) }), ref)).toEqual({ receipt: 'RetainedWriteReceipt', races: [['bob']] });
  });

  it('keeps a final unretained outcome from the record, and removes it', async () => {
    const path = await repository();
    const ref = await unsettled(path);
    // Over custody's 4 MiB page, under the journal's 5 MiB record decode limit.
    rewrite(path, ref, { occurrences: [[0, 'x'.repeat(4_600_000)]] });

    const answer = await (await open(path, { clock })).as('alice').reconcile(ref.split('/').at(-1) ?? '');

    expect(answer instanceof UnretainedWriteReceipt ? [answer.retention, answer.attempt] : answer).toEqual(['evidence-too-large', null]);
    expect(attemptRefs(path)).toEqual([]);
  });
});
