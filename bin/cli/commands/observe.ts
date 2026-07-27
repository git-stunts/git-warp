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
import type Runtime from '../../../src/application/Runtime.ts';
import type Lane from '../../../src/domain/api/Lane.ts';
import type Observer from '../../../src/domain/api/Observer.ts';
import type { ReadingValue } from '../../../src/domain/api/ReadingValue.ts';

const OBSERVE_OPTIONS = {
  observer: { type: 'string' },
  reading: { type: 'string' },
};

const OBSERVE_SCHEMA = z.object({
  observer: z.string().min(1),
  reading: z.string().min(1),
});

type ObservationCommandResult = {
  readonly payload: McpJsonValue;
  readonly human: string;
  readonly lines: readonly McpJsonValue[];
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
