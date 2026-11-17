import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Runtime } from '../../../index.ts';
import RuntimeHost from '../../../src/domain/RuntimeHost.ts';
import LegacyReading from '../../../src/domain/api/Reading.ts';
import { createObserver } from '../../../src/domain/api/ObserverRuntime.ts';
import type { ReadingValue } from '../../../src/domain/api/ObservedReading.ts';
import { PATCH_PROPERTY_VALUE_MAX_DEPTH } from '../../../src/domain/types/PatchPropertyValueDepth.ts';
import type { PropValue } from '../../../src/domain/types/PropValue.ts';
import { CborIndexStoreAdapter } from '../../../src/infrastructure/adapters/CborIndexStoreAdapter.ts';
import { createTestRepo } from '../api/helpers/setup.ts';

/**
 * #1159, Safety Review F1 on PR #1214, and the front office decision on it
 * (issuecomment-6961362143): the property root admits every value that the
 * patch codec accepts, for its writer and its readers alike.
 *
 * Oracle: the decision. On Git storage, a property value at the deepest
 * nesting the patch codec reads back is written to a checkpoint by
 * session-backed materialization, and a fresh runtime reads it back through
 * the bounded checkpoint read (property pages, no materialize). A value one
 * level deeper is refused by the patch codec when the patch is read.
 */
const LANE = 'events';
const WRITER = 'agent-1';
const DEEP = 'node:deep';
const PLAIN = 'node:plain';
const KEY = 'value';

function nestedValue(depth: number): PropValue {
  let value: PropValue = 'leaf';
  for (let level = 0; level < depth; level += 1) {
    value = [value];
  }
  return value;
}

describe('a property value at the patch codec depth limit (#1159 F1)', () => {
  let repository: Awaited<ReturnType<typeof createTestRepo>>;

  beforeEach(async () => {
    repository = await createTestRepo('property-value-depth');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await repository.cleanup();
  });

  it('checkpoints, materializes and reads back through the bounded read', async () => {
    const deep = nestedValue(PATCH_PROPERTY_VALUE_MAX_DEPTH);
    const seed = await repository.openGraph(LANE, WRITER);
    await seed.patch((patch) => {
      patch.addNode(DEEP).setProperty(DEEP, KEY, deep).addNode(PLAIN).setProperty(PLAIN, KEY, 'v');
    });

    await expect(seed.materialize()).resolves.toBeDefined();
    await expect(seed.createCheckpoint()).resolves.toMatch(/^[0-9a-f]{40}$/);

    const materialize = vi.spyOn(RuntimeHost.prototype, 'materialize');
    const decodeShardAt = vi.spyOn(CborIndexStoreAdapter.prototype, 'decodeShardAt');
    const read = await readFromFreshRuntime(repository.tempDir);

    expect(read).toEqual({ deep, deepStatus: 'completed', plain: 'v', plainStatus: 'completed' });
    expect(materialize).not.toHaveBeenCalled();
    expect(decodeShardAt.mock.calls.filter(([, path]) => path.startsWith('props_'))).toHaveLength(2);
  });

  it('is the limit: the patch codec refuses a value one level deeper when it reads the patch', async () => {
    const writer = await repository.openGraph(LANE, WRITER);
    await writer.patch((patch) => {
      patch.addNode(DEEP).setProperty(DEEP, KEY, nestedValue(PATCH_PROPERTY_VALUE_MAX_DEPTH + 1));
    });
    const reader = await repository.openGraph(LANE, 'agent-2');

    await expect(reader.materialize()).rejects.toMatchObject({
      code: 'E_CBOR_DECODE_BOUNDS',
      message: expect.stringContaining('nesting depth exceeds the configured maximum'),
    });
  });
});

async function readFromFreshRuntime(at: string) {
  const runtime = await Runtime.open({ at, writer: WRITER });
  try {
    const lane = await runtime.lane(LANE);
    const deep = lane.observe(propertyOf(DEEP));
    const plain = lane.observe(propertyOf(PLAIN));
    return Object.freeze({
      deep: (await deep.one()).value,
      deepStatus: (await deep.receipt).status,
      plain: (await plain.one()).value,
      plainStatus: (await plain.receipt).status,
    });
  } finally {
    await runtime.close();
  }
}

function propertyOf(subject: string) {
  return createObserver<ReadingValue>(
    `events.value-of-${subject}`,
    LegacyReading.property({ subject, key: KEY }),
    (value) => value,
  );
}
