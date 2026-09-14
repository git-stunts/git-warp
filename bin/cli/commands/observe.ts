import { z } from 'zod';

import { parseCommandArgs } from '../infrastructure.ts';
import type { CliOptions } from '../types.ts';
import { observerFromText } from '../v19/V19DomainInput.ts';
import { openRequiredLane, withRuntime } from '../v19/V19Runtime.ts';
import {
  readingEnvelope,
  receiptEnvelope,
  renderReading,
  renderReceipt,
} from '../../presenters/V19ReadingReceipt.ts';
import type { McpJsonValue } from './mcp/McpJsonValue.ts';
import Runtime from '../../../src/application/Runtime.ts';
import type Lane from '../../../src/domain/api/Lane.ts';
import type Observation from '../../../src/domain/api/Observation.ts';
import type Reading from '../../../src/domain/api/ObservedReading.ts';
import type Observer from '../../../src/domain/api/Observer.ts';
import type { ReadingValue } from '../../../src/domain/api/ReadingValue.ts';
import {
  completeCleanupSteps,
  completeWithCleanup,
} from '../../../src/infrastructure/adapters/OperationCleanup.ts';

const OBSERVE_OPTIONS = {
  observer: { type: 'string' },
  reading: { type: 'string' },
};

const OBSERVE_SCHEMA = z.object({
  observer: z.string().min(1),
  reading: z.string().min(1),
});

type ObservationCommandResult =
  | {
      readonly payload: McpJsonValue;
      readonly human: string;
      readonly lines: readonly McpJsonValue[];
    }
  | {
      readonly payload: undefined;
      readonly human: undefined;
      readonly lines: AsyncIterable<McpJsonValue>;
    };

type ObserveLaneFields = Readonly<{
  readonly observerId: string;
  readonly options: CliOptions;
  readonly reading: string;
  readonly runtime: Runtime;
}>;

type ObservationResultFields = Readonly<{
  readonly lane: Lane;
  readonly observer: Observer<ReadingValue>;
  readonly readings: readonly McpJsonValue[];
  readonly receipt: McpJsonValue;
}>;

export default async function handleObserve({
  options,
  args,
}: {
  readonly options: CliOptions;
  readonly args: string[];
}): Promise<ObservationCommandResult> {
  const { values } = parseCommandArgs(
    args,
    OBSERVE_OPTIONS,
    OBSERVE_SCHEMA,
  );
  if (options.jsonl) {
    return await streamLaneObservation({
      options,
      observerId: values.observer,
      reading: values.reading,
    });
  }
  return await withRuntime(
    options,
    async (runtime) =>
      await observeLane({
        runtime,
        options,
        observerId: values.observer,
        reading: values.reading,
      }),
  );
}

class ObservationLineStream
implements AsyncIterable<McpJsonValue>, AsyncIterator<McpJsonValue> {
  readonly #observation: Observation<ReadingValue>;
  readonly #readings: AsyncIterator<Reading<ReadingValue>>;
  readonly #runtime: Runtime;
  #closePromise: Promise<void> | null = null;
  #receiptEmitted = false;

  constructor(runtime: Runtime, observation: Observation<ReadingValue>) {
    this.#runtime = runtime;
    this.#observation = observation;
    this.#readings = observation[Symbol.asyncIterator]();
  }

  [Symbol.asyncIterator](): AsyncIterator<McpJsonValue> {
    return this;
  }

  async next(): Promise<IteratorResult<McpJsonValue>> {
    if (this.#receiptEmitted) {
      return { done: true, value: undefined };
    }
    let receipt: McpJsonValue;
    try {
      const reading = await this.#readings.next();
      if (reading.done !== true) {
        return { done: false, value: readingEnvelope(reading.value) };
      }
      receipt = receiptEnvelope(await this.#observation.receipt);
    } catch (error) {
      return await this.#fail(error);
    }
    this.#receiptEmitted = true;
    await this.#closeResources(false);
    return { done: false, value: receipt };
  }

  async return(): Promise<IteratorResult<McpJsonValue>> {
    this.#receiptEmitted = true;
    await this.#closeResources(true);
    return { done: true, value: undefined };
  }

  async #fail<Failure>(operationFailure: Failure): Promise<never> {
    return await completeWithCleanup(
      async () => await Promise.reject(operationFailure),
      async () => await this.#closeResources(true),
      'CLI observation and cleanup both failed',
    );
  }

  async #closeResources(cancelReadings: boolean): Promise<void> {
    this.#closePromise ??= this.#beginClose(cancelReadings);
    return await this.#closePromise;
  }

  async #beginClose(cancelReadings: boolean): Promise<void> {
    const cancel = this.#readings.return?.bind(this.#readings);
    await completeCleanupSteps([
      async () => {
        if (cancelReadings && cancel !== undefined) {
          await cancel();
        }
      },
      async () => {
        await this.#observation.receipt;
      },
      async () => await this.#runtime.close(),
    ], 'CLI observation cleanup failed');
  }
}

async function streamLaneObservation(
  fields: Omit<ObserveLaneFields, 'runtime'>,
): Promise<ObservationCommandResult> {
  const { observerId, options, reading } = fields;
  const runtime = await Runtime.open({
    at: options.repo,
    writer: options.writer,
  });
  try {
    const lane = await openRequiredLane(runtime, options.lane, options.strand);
    const observer = observerFromText(observerId, reading);
    return {
      payload: undefined,
      human: undefined,
      lines: new ObservationLineStream(runtime, lane.observe(observer)),
    };
  } catch (error) {
    return await closeStreamingOpenFailure(runtime, error);
  }
}

async function closeStreamingOpenFailure<Failure>(
  runtime: Runtime,
  openFailure: Failure,
): Promise<never> {
  return await completeWithCleanup(
    async () => await Promise.reject(openFailure),
    async () => await runtime.close(),
    'CLI observation open and cleanup both failed',
  );
}

async function observeLane(
  fields: ObserveLaneFields,
): Promise<ObservationCommandResult> {
  const { observerId, options, reading, runtime } = fields;
  const lane = await openRequiredLane(
    runtime,
    options.lane,
    options.strand,
  );
  const observer = observerFromText(observerId, reading);
  const observation = lane.observe(observer);
  const readings: McpJsonValue[] = [];
  for await (const observed of observation) {
    readings.push(readingEnvelope(observed));
  }
  return observationResult({
    lane,
    observer,
    readings,
    receipt: receiptEnvelope(await observation.receipt),
  });
}

function observationResult(
  fields: ObservationResultFields,
): ObservationCommandResult {
  const { lane, observer, readings, receipt } = fields;
  const lines = Object.freeze([...readings, receipt]);
  return {
    payload: Object.freeze({
      type: 'Observation',
      lane: lane.name,
      observer: Object.freeze({
        id: observer.id,
        cardinality: observer.cardinality,
      }),
      readings: Object.freeze([...readings]),
      receipt,
    }),
    human: [
      ...readings.map(renderReading),
      renderReceipt(receipt),
    ].join('\n\n'),
    lines,
  };
}
