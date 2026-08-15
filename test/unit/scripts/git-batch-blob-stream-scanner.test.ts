import { describe, expect, it } from 'vitest';

import { GitBatchBlobStreamScanner }
  from '../../../scripts/GitBatchBlobStreamScanner.ts';
import { GitBatchReadWindow } from '../../../scripts/GitBatchReadWindow.ts';
import { MachineLocalPathPolicy } from '../../../scripts/MachineLocalPathPolicy.ts';

const FIRST_OBJECT_ID = '1'.repeat(40);
const SECOND_OBJECT_ID = '2'.repeat(40);

function personalHome(...segments: readonly string[]): string {
  return ['', 'Users', 'example', ...segments].join('/');
}

function batchRecord(objectId: string, payload: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from(`${objectId} blob ${String(payload.length)}\n`, 'utf8'),
    payload,
    Buffer.from('\n', 'utf8'),
  ]);
}

async function* bytesSource(bytes: Buffer): AsyncGenerator<Uint8Array> {
  yield bytes;
}

async function* chunkSource(chunks: readonly Buffer[]): AsyncGenerator<Uint8Array> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

function scanner(bytes: Buffer, windowBytes: number): GitBatchBlobStreamScanner {
  return new GitBatchBlobStreamScanner(
    bytesSource(bytes),
    new MachineLocalPathPolicy(),
    new GitBatchReadWindow(windowBytes)
  );
}

describe('Git batch blob stream scanner', () => {
  it('scans an aggregate larger than its bounded read window', async () => {
    const batch = Buffer.concat([
      batchRecord(FIRST_OBJECT_ID, Buffer.from('portable first payload', 'utf8')),
      batchRecord(SECOND_OBJECT_ID, Buffer.from('portable second payload', 'utf8')),
    ]);

    await expect(scanner(batch, 5).findLeakingBlobIds([
      FIRST_OBJECT_ID,
      SECOND_OBJECT_ID,
    ])).resolves.toEqual(new Set());
  });

  it('detects a forbidden token split across bounded reads', async () => {
    const batch = batchRecord(
      FIRST_OBJECT_ID,
      Buffer.from(personalHome('build', 'artifact'), 'utf8')
    );

    await expect(scanner(batch, 3).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).resolves.toEqual(new Set([FIRST_OBJECT_ID]));
  });

  it('ignores empty source chunks without stalling payload consumption', async () => {
    const record = batchRecord(FIRST_OBJECT_ID, Buffer.from('portable', 'utf8'));
    const streamScanner = new GitBatchBlobStreamScanner(
      chunkSource([Buffer.alloc(0), record.subarray(0, 8), Buffer.alloc(0), record.subarray(8)]),
      new MachineLocalPathPolicy(),
      new GitBatchReadWindow(3)
    );

    await expect(streamScanner.findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).resolves.toEqual(new Set());
  });

  it('fails closed on a malformed blob header', async () => {
    const malformed = Buffer.from(`${FIRST_OBJECT_ID} tree 0\n\n`, 'utf8');

    await expect(scanner(malformed, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob header');
  });

  it('fails closed on an oversized blob header before buffering payload bytes', async () => {
    const oversized = Buffer.from('x'.repeat(129), 'utf8');

    await expect(scanner(oversized, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob header');
  });

  it('fails closed when an oversized blob header eventually terminates', async () => {
    const oversized = Buffer.from(`${'x'.repeat(129)}\n`, 'utf8');

    await expect(scanner(oversized, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob header');
  });

  it('fails closed on an unsafe blob size', async () => {
    const unsafeSize = Buffer.from(
      `${FIRST_OBJECT_ID} blob ${String(Number.MAX_SAFE_INTEGER + 1)}\n`,
      'utf8'
    );

    await expect(scanner(unsafeSize, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob header');
  });

  it('fails closed when Git returns a different object identity', async () => {
    const mismatched = batchRecord(SECOND_OBJECT_ID, Buffer.from('portable', 'utf8'));

    await expect(scanner(mismatched, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob header');
  });

  it('fails closed on a truncated blob header', async () => {
    const truncated = Buffer.from(`${FIRST_OBJECT_ID} blob`, 'utf8');

    await expect(scanner(truncated, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('truncated batch header');
  });

  it('fails closed on a truncated blob payload', async () => {
    const truncated = Buffer.from(`${FIRST_OBJECT_ID} blob 5\nabc`, 'utf8');

    await expect(scanner(truncated, 2).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('truncated batch blob');
  });

  it('fails closed on a malformed blob delimiter', async () => {
    const malformed = Buffer.concat([
      Buffer.from(`${FIRST_OBJECT_ID} blob 3\nabc`, 'utf8'),
      Buffer.from('x', 'utf8'),
    ]);

    await expect(scanner(malformed, 2).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob delimiter');
  });

  it('accepts an empty blob without inventing a match', async () => {
    const empty = batchRecord(FIRST_OBJECT_ID, Buffer.alloc(0));

    await expect(scanner(empty, 2).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).resolves.toEqual(new Set());
  });

  it('fails closed on trailing batch data', async () => {
    const trailing = Buffer.concat([
      batchRecord(FIRST_OBJECT_ID, Buffer.from('portable', 'utf8')),
      Buffer.from('trailing', 'utf8'),
    ]);

    await expect(scanner(trailing, 4).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('trailing batch blob data');
  });

  it('fails closed on trailing data delivered after empty stream chunks', async () => {
    const record = batchRecord(FIRST_OBJECT_ID, Buffer.from('portable', 'utf8'));
    const streamScanner = new GitBatchBlobStreamScanner(
      chunkSource([record, Buffer.alloc(0), Buffer.from('trailing', 'utf8')]),
      new MachineLocalPathPolicy(),
      new GitBatchReadWindow(4)
    );

    await expect(streamScanner.findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('trailing batch blob data');
  });

  it('rejects invalid read windows at construction', () => {
    expect(() => new GitBatchReadWindow(0)).toThrow('positive safe integer');
    expect(() => new GitBatchReadWindow(Number.NaN)).toThrow('positive safe integer');
  });
});
