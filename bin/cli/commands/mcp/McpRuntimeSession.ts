import Runtime from '../../../../src/application/Runtime.ts';
import type { CliOptions } from '../../types.ts';
import type { ReviewedSettlement } from '../../v19/V19SettlementReview.ts';
import type { McpJsonValue } from './McpJsonValue.ts';
import McpProtocolError from './McpProtocolError.ts';

type ObservationTransport = {
  readonly buffered: McpJsonValue[];
  readonly iterator: AsyncIterator<McpJsonValue>;
  readonly receipt: () => Promise<McpJsonValue>;
  cursor: number;
  receiptRef: string | null;
  terminal: boolean;
};

type RetainedObservation = Readonly<{
  readonly observationId: string;
  readonly terminal: boolean;
  readonly receiptRef: string | null;
}>;

export default class McpRuntimeSession {
  readonly #at: string;
  readonly #observations = new Map<string, ObservationTransport>();
  readonly #plans = new Map<string, ReviewedSettlement>();
  readonly #receipts = new Map<string, McpJsonValue>();
  readonly #writer: string;
  #nextObservation = 1;
  #nextPlan = 1;
  #nextReceipt = 1;
  #runtime: Promise<Runtime> | null = null;
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
      const runtime = await this.runtime();
      return await task(runtime);
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

  async retainObservation(options: {
    readonly readings: AsyncIterable<McpJsonValue>;
    readonly receipt: () => Promise<McpJsonValue>;
  }): Promise<RetainedObservation> {
    const identifier = `observation-${this.#nextObservation}`;
    this.#nextObservation += 1;
    const transport: ObservationTransport = {
      buffered: [],
      iterator: options.readings[Symbol.asyncIterator](),
      receipt: options.receipt,
      cursor: 0,
      receiptRef: null,
      terminal: false,
    };
    this.#observations.set(identifier, transport);
    await this.pullObservation(transport);
    return Object.freeze({
      observationId: identifier,
      terminal: transport.terminal,
      receiptRef: transport.receiptRef,
    });
  }

  async readObservation(
    identifier: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<McpJsonValue> {
    const observation = this.requireObservation(identifier);
    this.assertObservationCursor(observation, cursor);
    const readings = await this.readObservationPage(observation, limit);
    await this.pullObservation(observation);
    observation.cursor += readings.length;
    return Object.freeze({
      observationId: identifier,
      readings: Object.freeze(readings),
      cursor: observation.terminal ? null : String(observation.cursor),
      terminal: observation.terminal,
      receiptRef: observation.receiptRef,
    });
  }

  private assertObservationCursor(
    observation: ObservationTransport,
    cursor: string | undefined,
  ): void {
    const expectedCursor = String(observation.cursor);
    if (cursor !== undefined && cursor !== expectedCursor) {
      throw new McpProtocolError(
        -32602,
        `Observation cursor mismatch: expected ${expectedCursor}`,
      );
    }
  }

  private async readObservationPage(
    observation: ObservationTransport,
    limit: number,
  ): Promise<McpJsonValue[]> {
    const readings: McpJsonValue[] = [];
    while (readings.length < limit) {
      await this.pullObservation(observation);
      const reading = observation.buffered.shift();
      if (reading === undefined) {
        break;
      }
      readings.push(reading);
    }
    return readings;
  }

  async cancelObservation(identifier: string): Promise<McpJsonValue> {
    const observation = this.requireObservation(identifier);
    await observation.iterator.return?.();
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
    await Promise.all(
      [...this.#observations.values()].map(
        async (observation) => await observation.iterator.return?.(),
      ),
    );
    this.#observations.clear();
    this.#plans.clear();
    this.#receipts.clear();
    if (this.#runtime !== null) {
      await (await this.#runtime).close();
      this.#runtime = null;
    }
  }

  private runtime(): Promise<Runtime> {
    this.#runtime ??= Runtime.open({
      at: this.#at,
      writer: this.#writer,
    });
    return this.#runtime;
  }

  private async pullObservation(
    observation: ObservationTransport,
  ): Promise<void> {
    if (observation.terminal || observation.buffered.length > 0) {
      return;
    }
    const next = await observation.iterator.next();
    if (next.done !== true) {
      observation.buffered.push(next.value);
      return;
    }
    observation.terminal = true;
    observation.receiptRef = this.retainReceipt(await observation.receipt());
  }

  private requireObservation(identifier: string): ObservationTransport {
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
