import type WarpAccessPort from '../../../ports/WarpAccessPort.ts';
import { coneObstructionFailure } from '../../api/ConeObstructionFailure.ts';
import OpticObservation, { type OpticExecution } from '../../api/OpticObservation.ts';
import OpticReading from '../../api/OpticReading.ts';
import OpticReceipt, { type OpticReceiptStatus } from '../../api/OpticReceipt.ts';
import type { OpticQuestion } from '../../api/OpticQuestion.ts';
import type { OpticValue } from '../../api/OpticValue.ts';
import type ObserverIdentity from '../../api/ObserverIdentity.ts';
import type Purpose from '../../api/Purpose.ts';
import type ReadBudget from '../../api/ReadBudget.ts';
import WarpReadGrant from '../../api/WarpReadGrant.ts';
import WarpReadRequest from '../../api/WarpReadRequest.ts';
import WarpAccessDenied from '../../api/WarpAccessDenied.ts';
import ImmutableBytes from '../snapshot/ImmutableBytes.ts';
import { canonicalStringify } from '../../utils/canonicalStringify.ts';
import { textEncode } from '../../utils/bytes.ts';
import type ConeBasis from '../cone/ConeBasis.ts';
import type ConeLaneBasis from '../cone/ConeLaneBasis.ts';
import ConeObstruction from '../cone/ConeObstruction.ts';
import { hydrateConeState } from '../cone/ConeStateHydration.ts';
import { createStateReader } from '../state/StateReader.ts';
import readOperationalFailure from './ReadOperationalFailure.ts';

export type ConeReadRequest = {
  readonly observer: ObserverIdentity;
  readonly purpose: Purpose;
  readonly budget: ReadBudget | null;
  readonly question: OpticQuestion;
  readonly onSettled?: () => void;
};

const NODE_QUESTION = 'node.presence/v1';
const PROPERTY_QUESTION = 'node.property/v1';
const RECORDS_PER_EXACT_READ = 1;

/**
 * Runs one bounded read (#1052). Access is decided before the basis is touched, and
 * the basis is fixed when `read` starts, so a read neither asks for repair nor
 * falls back on whole state. It reads only the subject's record.
 */
export default class ConeReadExecutor {
  readonly #graph: string;
  readonly #access: WarpAccessPort;
  readonly #cone: () => Promise<ConeLaneBasis>;

  constructor(fields: { readonly graph: string; readonly access: WarpAccessPort; readonly cone: () => Promise<ConeLaneBasis> }) {
    this.#graph = fields.graph;
    this.#access = fields.access;
    this.#cone = fields.cone;
    Object.freeze(this);
  }

  async read(request: ConeReadRequest): Promise<OpticObservation> {
    const receipt = this.#receipts(request);
    const grant = await this.#access.authorizeRead(new WarpReadRequest({
      graph: this.#graph, observer: request.observer, purpose: request.purpose,
      question: questionName(request.question), budget: request.budget,
    }));
    if (!(grant instanceof WarpReadGrant)) {
      return ended(receipt, receipt('refused', { cause: deniedCause(grant) }), request.onSettled);
    }
    const cone = await this.#openCone(receipt, request.onSettled);
    if (cone instanceof OpticObservation) {
      return cone;
    }
    const basis = await this.#advance(cone, receipt, request.onSettled);
    if (basis instanceof OpticObservation) { return basis; }
    if (basis instanceof ConeObstruction) {
      const failure = coneObstructionFailure(basis);
      return ended(receipt, receipt('failed', { cause: failure.reason, repairHints: failure.repairHints }), request.onSettled);
    }
    return new OpticObservation(this.#execution({ request, grant, cone, basis, receipt }));
  }

  async #advance(cone: ConeLaneBasis, receipt: ReceiptMaker, onSettled?: () => void): Promise<ConeBasis | ConeObstruction | OpticObservation> {
    try {
      return await cone.advance();
    } catch (error) {
      const cause = error instanceof Error ? readOperationalFailure(error, 'reading') : null;
      if (cause === null) { throw error; }
      return ended(receipt, receipt('failed', { cause }), onSettled);
    }
  }

  async #openCone(receipt: ReceiptMaker, onSettled?: () => void): Promise<ConeLaneBasis | OpticObservation> {
    try {
      return await this.#cone();
    } catch (error) {
      const cause = error instanceof Error ? readOperationalFailure(error, 'opening') : null;
      if (cause === null) { throw error; }
      return ended(receipt, receipt('failed', { cause }), onSettled);
    }
  }

  #execution(run: {
    readonly request: ConeReadRequest;
    readonly grant: WarpReadGrant;
    readonly cone: ConeLaneBasis;
    readonly basis: ConeBasis;
    readonly receipt: ReceiptMaker;
  }): OpticExecution {
    const { receipt } = run;
    const answered = this.#reading.bind(this);
    let records = 0;
    return {
      ...(run.request.onSettled === undefined ? {} : { onSettled: run.request.onSettled }),
      cancelled: () => receipt('cancelled', { cause: 'cancelled', records }),
      failed: (cause: string) => receipt('failed', { cause, records }),
      async *readings(): AsyncGenerator<OpticReading, OpticReceipt, undefined> {
        const reading = await answered(run.request.question, run, receipt);
        if (reading instanceof OpticReceipt) { return reading; }
        records += RECORDS_PER_EXACT_READ;
        if (encodedSize(reading) > run.grant.budget.bytes) {
          return receipt('budget-exhausted', { cause: 'budget-exhausted', records: RECORDS_PER_EXACT_READ });
        }
        yield reading;
        return receipt('completed', { cause: null, records: RECORDS_PER_EXACT_READ });
      },
    };
  }

  async #reading(question: OpticQuestion, scope: { readonly cone: ConeLaneBasis; readonly basis: ConeBasis }, receipt: ReceiptMaker): Promise<OpticReading | OpticReceipt> {
    try {
      return await this.#answered(question, scope.cone, scope.basis);
    } catch (error) {
      const cause = error instanceof Error ? readOperationalFailure(error, 'reading') : null;
      if (cause === null) { throw error; }
      return receipt('failed', { cause });
    }
  }

  async #answered(question: OpticQuestion, cone: ConeLaneBasis, basis: ConeBasis): Promise<OpticReading> {
    const record = await cone.reader.node(basis.root, question.subject);
    const state = createStateReader(hydrateConeState([record], []));
    const alive = state.hasNode(question.subject);
    if (question.key === null) {
      return new OpticReading({ subject: question.subject, key: null, present: alive, value: null });
    }
    const props = alive ? state.getNodeProps(question.subject) : null;
    return propertyReading(question.subject, question.key, props);
  }

  #receipts(request: ConeReadRequest): ReceiptMaker {
    return (status, detail) => new OpticReceipt({
      status, graph: this.#graph, observer: request.observer.toString(), purpose: request.purpose.toString(),
      question: questionName(request.question), cause: detail.cause, records: detail.records ?? 0,
      ...(detail.repairHints === undefined ? {} : { repairHints: detail.repairHints }),
    });
  }
}

type ReceiptDetail = {
  readonly cause: string | null;
  readonly records?: number;
  readonly repairHints?: OpticReceipt['repairHints'];
};
type ReceiptMaker = (status: OpticReceiptStatus, detail: ReceiptDetail) => OpticReceipt;

function questionName(question: OpticQuestion): string {
  return question.key === null ? NODE_QUESTION : PROPERTY_QUESTION;
}

function propertyReading(
  subject: string,
  key: string,
  props: Readonly<Record<string, OpticValue>> | null,
): OpticReading {
  const present = props !== null && Object.hasOwn(props, key);
  const value = present ? (props[key] ?? null) : null;
  return new OpticReading({ subject, key, present, value });
}

function deniedCause(decision: WarpAccessDenied | WarpReadGrant): string {
  return `access-denied: ${decision instanceof WarpAccessDenied ? decision.cause : 'the access boundary gave no grant'}`;
}

/** An observation whose terminal result was decided before anything was read. */
function ended(receipt: ReceiptMaker, terminal: OpticReceipt, onSettled?: () => void): OpticObservation {
  return new OpticObservation({
    decided: terminal,
    ...(onSettled === undefined ? {} : { onSettled }),
    cancelled: () => receipt('cancelled', { cause: 'cancelled' }),
    // eslint-disable-next-line require-yield -- A decided read emits nothing.
    async *readings(): AsyncGenerator<OpticReading, OpticReceipt, undefined> { return await Promise.resolve(terminal); },
  });
}

function encodedSize(reading: OpticReading): number {
  if (reading.key === null || !reading.present) {
    return 0;
  }
  return valueByteLength(reading.value);
}

function isOpticValueArray(value: OpticValue | null): value is readonly OpticValue[] {
  return Array.isArray(value);
}

function valueByteLength(value: OpticValue | null): number {
  if (value instanceof ImmutableBytes) {
    return value.length;
  }
  if (isOpticValueArray(value)) {
    return arrayByteLength(value);
  }
  if (value !== null && typeof value === 'object') {
    return objectByteLength(value);
  }
  return textEncode(canonicalStringify(value)).length;
}

function arrayByteLength(items: readonly OpticValue[]): number {
  let total = 2;
  for (const item of items) {
    total += valueByteLength(item) + 1;
  }
  return items.length > 0 ? total - 1 : 2;
}

function objectByteLength(record: { readonly [key: string]: OpticValue }): number {
  const entries = Object.entries(record);
  let total = 2;
  for (const [key, val] of entries) {
    total += textEncode(canonicalStringify(key)).length + 1 + valueByteLength(val) + 1;
  }
  return entries.length > 0 ? total - 1 : 2;
}
