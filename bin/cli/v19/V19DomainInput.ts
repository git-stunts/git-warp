import { z } from 'zod';

import { intent, reading, createObserver } from '../../../advanced.ts';
import type Intent from '../../../src/domain/api/Intent.ts';
import type Observer from '../../../src/domain/api/Observer.ts';
import type { ReadingValue } from '../../../src/domain/api/ReadingValue.ts';
import type { McpJsonValue } from '../commands/mcp/McpJsonValue.ts';
import { V19_PUBLIC_NOUNS } from '../capabilities/V19CapabilityContract.generated.ts';
import { usageErrorFrom } from '../infrastructure.ts';

type JsonInput = null | boolean | number | string | JsonInput[] | { [key: string]: JsonInput };

export const JSON_INPUT_SCHEMA: z.ZodType<JsonInput> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number().finite(),
    z.string(),
    z.array(JSON_INPUT_SCHEMA),
    z.record(z.string(), JSON_INPUT_SCHEMA),
  ])
);

const INTENT_SCHEMA = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('node.add'),
      subject: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('node.remove'),
      subject: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('edge.add'),
      from: z.string().min(1),
      to: z.string().min(1),
      label: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('edge.remove'),
      from: z.string().min(1),
      to: z.string().min(1),
      label: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('property.set'),
      subject: z.string().min(1),
      key: z.string().min(1),
      value: JSON_INPUT_SCHEMA,
    })
    .strict(),
  z
    .object({
      kind: z.literal('entity.add'),
      subject: z.string().min(1).optional(),
      namespace: z.string().min(1).optional(),
      properties: z
        .record(z.string().min(1), JSON_INPUT_SCHEMA)
        .refine((properties) => Object.keys(properties).length > 0, {
          message: 'entity.add requires at least one property',
        }),
    })
    .strict(),
]);

const READING_SCHEMA = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('property.get'),
      subject: z.string().min(1),
      key: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('node.exists'),
      subject: z.string().min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal('neighborhood'),
      subject: z.string().min(1),
      direction: z.enum(['out', 'in', 'both']).optional(),
      labels: z.array(z.string().min(1)).optional(),
      limit: z.number().int().positive().optional(),
      cursor: z.string().min(1).optional(),
    })
    .strict(),
]);

export function intentFromText(text: string): Intent {
  try {
    return intentFromValue(JSON.parse(text));
  } catch (error) {
    throw usageErrorFrom(`Invalid ${V19_PUBLIC_NOUNS.Intent} JSON`, error);
  }
}

export function intentFromValue(value: McpJsonValue): Intent {
  const descriptor = parseIntentDescriptor(value);
  return descriptor.kind === 'entity.add'
    ? entityIntentFrom(descriptor)
    : elementIntentFrom(descriptor);
}

function entityIntentFrom(
  descriptor: Extract<z.infer<typeof INTENT_SCHEMA>, { kind: 'entity.add' }>
): Intent {
  if (descriptor.subject !== undefined && descriptor.namespace === undefined) {
    return intent.entity.add({
      subject: descriptor.subject,
      properties: descriptor.properties,
    });
  }
  if (descriptor.namespace !== undefined && descriptor.subject === undefined) {
    return intent.entity.addAuto({
      namespace: descriptor.namespace,
      properties: descriptor.properties,
    });
  }
  throw usageErrorFrom(
    'Invalid Intent entity.add identity',
    'exactly one of subject or namespace is required'
  );
}

function elementIntentFrom(
  descriptor: Exclude<z.infer<typeof INTENT_SCHEMA>, { kind: 'entity.add' }>
): Intent {
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

function parseIntentDescriptor(value: McpJsonValue): z.infer<typeof INTENT_SCHEMA> {
  try {
    return INTENT_SCHEMA.parse(value);
  } catch (error) {
    throw usageErrorFrom(`Invalid ${V19_PUBLIC_NOUNS.Intent}`, error);
  }
}

export function observerFromText(observerId: string, text: string): Observer<ReadingValue> {
  try {
    return observerFromValue(observerId, JSON.parse(text));
  } catch (error) {
    throw usageErrorFrom(`Invalid ${V19_PUBLIC_NOUNS.Observer} JSON`, error);
  }
}

export function observerFromValue(observerId: string, value: McpJsonValue): Observer<ReadingValue> {
  const descriptor = parseReadingDescriptor(value);
  if (descriptor.kind === 'property.get') {
    return propertyObserver(observerId, descriptor);
  }
  if (descriptor.kind === 'node.exists') {
    return nodeObserver(observerId, descriptor);
  }
  return neighborhoodObserver(observerId, descriptor);
}

function parseReadingDescriptor(value: McpJsonValue): z.infer<typeof READING_SCHEMA> {
  try {
    return READING_SCHEMA.parse(value);
  } catch (error) {
    throw usageErrorFrom(`Invalid ${V19_PUBLIC_NOUNS.Observer} ${V19_PUBLIC_NOUNS.Reading}`, error);
  }
}

function propertyObserver(
  observerId: string,
  descriptor: Extract<z.infer<typeof READING_SCHEMA>, { readonly kind: 'property.get' }>
): Observer<ReadingValue> {
  return createObserver(observerId, reading.property(descriptor), identityDecoder);
}

function nodeObserver(
  observerId: string,
  descriptor: Extract<z.infer<typeof READING_SCHEMA>, { readonly kind: 'node.exists' }>
): Observer<ReadingValue> {
  return createObserver(observerId, reading.node.exists(descriptor), identityDecoder);
}

function neighborhoodObserver(
  observerId: string,
  descriptor: Extract<z.infer<typeof READING_SCHEMA>, { readonly kind: 'neighborhood' }>
): Observer<ReadingValue> {
  const options = {
    subject: descriptor.subject,
    ...(descriptor.direction === undefined ? {} : { direction: descriptor.direction }),
    ...(descriptor.labels === undefined ? {} : { labels: descriptor.labels }),
    ...(descriptor.limit === undefined ? {} : { limit: descriptor.limit }),
    ...(descriptor.cursor === undefined ? {} : { cursor: descriptor.cursor }),
  };
  return createObserver(observerId, reading.neighborhood(options), identityDecoder);
}

function identityDecoder(value: ReadingValue): ReadingValue {
  return value;
}
