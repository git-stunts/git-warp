import Runtime from '../../../../src/application/Runtime.ts';
import type { CliOptions } from '../../types.ts';
import type { ReviewedSettlement } from '../../v19/V19SettlementReview.ts';
import type { McpJsonValue } from './McpJsonValue.ts';
import McpProtocolError from './McpProtocolError.ts';

type ObservationTransport = {
  readonly readings: readonly McpJsonValue[];
  readonly receiptRef: string;
  cursor: number;
};

export default class McpRuntimeSession {
  readonly #at: string;
  readonly #observations = new Map<string, ObservationTransport>();
  readonly #plans = new Map<string, ReviewedSettlement>();
  readonly #receipts = new Map<string, McpJsonValue>();
  readonly #writer: string;
  #nextObservation = 1;
  #nextPlan = 1;
  #nextReceipt = 1;
  #tail: Promise<void> = Promise.resolve();

  constructor(options: {
    readonly at: string;
    readonly writer: string;
  }) {
    this.#at = options.at;
    this.#writer = options.writer;
  }

  run<TResult>(
    task: (runtime: Runtime) => Promise<TResult>,
  ): Promise<TResult> {
    const result = this.#tail.then(async () => {
      const runtime = await Runtime.open({
        at: this.#at,
        writer: this.#writer,
      });
      try {
        return await task(runtime);
      } finally {
        await runtime.close();
      }
    });
    this.#tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  retainReceipt(receipt: McpJsonValue): string {
    const reference = `receipt-${this.#nextReceipt}`;
    this.#nextReceipt += 1;
    this.#receipts.set(reference, receipt);
    return reference;
  }

  getReceipt(reference: string): McpJsonValue {
    const receipt = this.#receipts.get(reference);
    if (receipt === undefined) {
      throw new McpProtocolError(
        -32602,
        `Receipt not found: ${reference}`,
      );
    }
    return receipt;
  }

  retainPlan(plan: ReviewedSettlement): string {
    const reference = `plan-${this.#nextPlan}`;
    this.#nextPlan += 1;
    this.#plans.set(reference, plan);
    return reference;
  }

  getPlan(reference: string): ReviewedSettlement {
    const plan = this.#plans.get(reference);
    if (plan === undefined) {
      throw new McpProtocolError(
        -32602,
        `Settlement plan not found: ${reference}`,
      );
    }
    return plan;
  }

  retainObservation(
    readings: readonly McpJsonValue[],
    receiptRef: string,
  ): string {
    const identifier = `observation-${this.#nextObservation}`;
    this.#nextObservation += 1;
    this.#observations.set(identifier, {
      readings: Object.freeze([...readings]),
      receiptRef,
      cursor: 0,
    });
    return identifier;
  }

  readObservation(
    identifier: string,
    cursor: string | undefined,
    limit: number,
  ): McpJsonValue {
    const observation = this.requireObservation(identifier);
    const expectedCursor = String(observation.cursor);
    if (cursor !== undefined && cursor !== expectedCursor) {
      throw new McpProtocolError(
        -32602,
        `Observation cursor mismatch: expected ${expectedCursor}`,
      );
    }
    const start = observation.cursor;
    const end = Math.min(start + limit, observation.readings.length);
    observation.cursor = end;
    const complete = end === observation.readings.length;
    return Object.freeze({
      observationId: identifier,
      readings: Object.freeze(observation.readings.slice(start, end)),
      cursor: complete ? null : String(end),
      terminal: complete,
      receiptRef: complete ? observation.receiptRef : null,
    });
  }

  cancelObservation(identifier: string): McpJsonValue {
    this.requireObservation(identifier);
    this.#observations.delete(identifier);
    return Object.freeze({
      observationId: identifier,
      canceled: true,
    });
  }

  cliOptions(lane: string): CliOptions {
    return {
      repo: this.#at,
      lane,
      strand: null,
      writer: this.#writer,
      writerExplicit: true,
      json: true,
      jsonl: false,
      help: false,
    };
  }

  async close(): Promise<void> {
    await this.#tail;
    this.#observations.clear();
    this.#plans.clear();
    this.#receipts.clear();
  }

  requireObservation(identifier: string): ObservationTransport {
    const observation = this.#observations.get(identifier);
    if (observation === undefined) {
      throw new McpProtocolError(
        -32602,
        `Observation not found: ${identifier}`,
      );
    }
    return observation;
  }
}
