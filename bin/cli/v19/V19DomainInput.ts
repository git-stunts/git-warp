import { z } from 'zod';

import { intent, reading, createObserver } from '../../../advanced.ts';
import type Intent from '../../../src/domain/api/Intent.ts';
import type Observer from '../../../src/domain/api/Observer.ts';
import type { ReadingValue } from '../../../src/domain/api/ReadingValue.ts';
import type { McpJsonValue } from '../commands/mcp/McpJsonValue.ts';

type JsonInput =
  | null
  | boolean
  | number
  | string
  | JsonInput[]
  | { [key: string]: JsonInput };

export const JSON_INPUT_SCHEMA: z.ZodType<JsonInput> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JSON_INPUT_SCHEMA),
    z.record(z.string(), JSON_INPUT_SCHEMA),
  ]),
);

const INTENT_SCHEMA = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('node.add'),
    subject: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('node.remove'),
    subject: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('edge.add'),
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('edge.remove'),
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('property.set'),
    subject: z.string().min(1),
    key: z.string().min(1),
    value: JSON_INPUT_SCHEMA,
  }).strict(),
]);

const READING_SCHEMA = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('property.get'),
    subject: z.string().min(1),
    key: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('node.exists'),
    subject: z.string().min(1),
  }).strict(),
  z.object({
    kind: z.literal('neighborhood'),
    subject: z.string().min(1),
    direction: z.enum(['out', 'in', 'both']).optional(),
    labels: z.array(z.string().min(1)).optional(),
    limit: z.number().int().positive().optional(),
    cursor: z.string().min(1).optional(),
  }).strict(),
]);

export function intentFromText(text: string): Intent {
  return intentFromValue(JSON.parse(text));
}

export function intentFromValue(value: McpJsonValue): Intent {
  const descriptor = INTENT_SCHEMA.parse(value);
  if (descriptor.kind === 'node.add') {
    return intent.node.add(descriptor);
  }
  if (descriptor.kind === 'node.remove') {
    return intent.node.remove(descriptor);
  }
  if (descriptor.kind === 'edge.add') {
    return intent.edge.add(descriptor);
  }
  if (descriptor.kind === 'edge.remove') {
    return intent.edge.remove(descriptor);
  }
  return intent.property.set(descriptor);
}

export function observerFromText(
  observerId: string,
  text: string,
): Observer<ReadingValue> {
  return observerFromValue(observerId, JSON.parse(text));
}

export function observerFromValue(
  observerId: string,
  value: McpJsonValue,
): Observer<ReadingValue> {
  const descriptor = READING_SCHEMA.parse(value);
  if (descriptor.kind === 'property.get') {
    return propertyObserver(observerId, descriptor);
  }
  if (descriptor.kind === 'node.exists') {
    return nodeObserver(observerId, descriptor);
  }
  return neighborhoodObserver(observerId, descriptor);
}

function propertyObserver(
  observerId: string,
  descriptor: Extract<
    z.infer<typeof READING_SCHEMA>,
    { readonly kind: 'property.get' }
  >,
): Observer<ReadingValue> {
  return createObserver(
    observerId,
    reading.property(descriptor),
    identityDecoder,
  );
}

function nodeObserver(
  observerId: string,
  descriptor: Extract<
    z.infer<typeof READING_SCHEMA>,
    { readonly kind: 'node.exists' }
  >,
): Observer<ReadingValue> {
  return createObserver(
    observerId,
    reading.node.exists(descriptor),
    identityDecoder,
  );
}

function neighborhoodObserver(
  observerId: string,
  descriptor: Extract<
    z.infer<typeof READING_SCHEMA>,
    { readonly kind: 'neighborhood' }
  >,
): Observer<ReadingValue> {
  const options = {
    subject: descriptor.subject,
    ...(descriptor.direction === undefined
      ? {}
      : { direction: descriptor.direction }),
    ...(descriptor.labels === undefined ? {} : { labels: descriptor.labels }),
    ...(descriptor.limit === undefined ? {} : { limit: descriptor.limit }),
    ...(descriptor.cursor === undefined ? {} : { cursor: descriptor.cursor }),
  };
  return createObserver(
    observerId,
    reading.neighborhood(options),
    identityDecoder,
  );
}

function identityDecoder(value: ReadingValue): ReadingValue {
  return value;
}
