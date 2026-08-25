import WarpError from '../errors/WarpError.ts';
import { textEncode } from '../utils/bytes.ts';
import { canonicalStringify } from '../utils/canonicalStringify.ts';
import Intent, { type IntentDescriptor, type IntentKind } from './Intent.ts';

export const MAX_ATOMIC_WRITE_INTENTS = 50_000;
export const MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES = 16 * 1024 * 1024;

export type AtomicIntentArray = readonly [Intent, ...Intent[]];
export type WriteIntentInput = Intent | readonly Intent[];

export type AtomicIntentDescriptor = Readonly<{
  readonly kind: 'intent.sequence';
  readonly intents: readonly IntentDescriptor[];
}>;

export type WriteIntentDescriptor = IntentDescriptor | AtomicIntentDescriptor;

type NormalizedIntentSequence = Readonly<{
  readonly atomic: boolean;
  readonly descriptor: WriteIntentDescriptor;
  readonly input: Intent | AtomicIntentArray;
  readonly intents: AtomicIntentArray;
}>;

const normalizedSequences = new WeakMap<object, IntentSequence>();

/** One validated write request that will lower into exactly one patch. */
export default class IntentSequence {
  readonly #atomic: boolean;
  readonly #descriptor: WriteIntentDescriptor;
  readonly #input: Intent | AtomicIntentArray;
  readonly #intents: AtomicIntentArray;

  private constructor(input: WriteIntentInput) {
    const normalized = normalizeIntentSequence(input);
    this.#atomic = normalized.atomic;
    this.#descriptor = normalized.descriptor;
    this.#input = normalized.input;
    this.#intents = normalized.intents;
    Object.freeze(this);
  }

  static from(input: WriteIntentInput): IntentSequence {
    const known = normalizedSequences.get(input);
    if (known !== undefined) {
      return known;
    }
    const sequence = new IntentSequence(input);
    normalizedSequences.set(sequence.input, sequence);
    return sequence;
  }

  get atomic(): boolean {
    return this.#atomic;
  }

  get descriptor(): WriteIntentDescriptor {
    return this.#descriptor;
  }

  get input(): Intent | AtomicIntentArray {
    return this.#input;
  }

  get intents(): AtomicIntentArray {
    return this.#intents;
  }

  get kinds(): readonly IntentKind[] {
    return Object.freeze(this.#intents.map(({ kind }) => kind));
  }
}

function normalizeIntentSequence(input: WriteIntentInput): NormalizedIntentSequence {
  if (input instanceof Intent) {
    const intents = freezeIntentArray(input, []);
    return Object.freeze({
      atomic: false,
      descriptor: input.descriptor,
      input,
      intents,
    });
  }
  if (!Array.isArray(input)) {
    throw new WarpError(
      'Intent sequence requires an Intent or a non-empty Intent array',
      'E_INTENT_SEQUENCE_INPUT',
    );
  }
  return normalizeAtomicIntentArray(input);
}

function normalizeAtomicIntentArray(input: readonly Intent[]): NormalizedIntentSequence {
  requireAtomicIntentCardinality(input);
  const first = requireIntent(input[0], 0);
  const intents = freezeIntentArray(first, input.slice(1));
  const descriptor = atomicDescriptor(intents);
  requireAtomicDescriptorSize(descriptor);
  return Object.freeze({ atomic: true, descriptor, input: intents, intents });
}

function requireAtomicIntentCardinality(input: readonly Intent[]): void {
  if (input.length === 0) {
    throw new WarpError(
      'Atomic intent array must contain at least one Intent',
      'E_INTENT_SEQUENCE_EMPTY',
    );
  }
  if (input.length > MAX_ATOMIC_WRITE_INTENTS) {
    throw new WarpError(
      `Atomic intent array exceeds ${String(MAX_ATOMIC_WRITE_INTENTS)} Intents`,
      'E_INTENT_SEQUENCE_CARDINALITY',
    );
  }
}

function freezeIntentArray(first: Intent, remaining: readonly Intent[]): AtomicIntentArray {
  const intents: [Intent, ...Intent[]] = [requireIntent(first, 0)];
  for (const [offset, candidate] of remaining.entries()) {
    intents.push(requireIntent(candidate, offset + 1));
  }
  return Object.freeze(intents);
}

function requireIntent(candidate: Intent | undefined, index: number): Intent {
  if (!(candidate instanceof Intent)) {
    throw new WarpError(
      `Atomic intent array member ${String(index)} is not an Intent`,
      'E_INTENT_SEQUENCE_MEMBER',
    );
  }
  return candidate;
}

function atomicDescriptor(intents: AtomicIntentArray): AtomicIntentDescriptor {
  return Object.freeze({
    kind: 'intent.sequence',
    intents: Object.freeze(intents.map(({ descriptor }) => descriptor)),
  });
}

function requireAtomicDescriptorSize(descriptor: AtomicIntentDescriptor): void {
  const encodedBytes = textEncode(canonicalStringify(descriptor)).byteLength;
  if (encodedBytes > MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES) {
    throw new WarpError(
      `Atomic intent descriptor exceeds ${String(MAX_ATOMIC_WRITE_DESCRIPTOR_BYTES)} bytes`,
      'E_INTENT_SEQUENCE_SIZE',
    );
  }
}
