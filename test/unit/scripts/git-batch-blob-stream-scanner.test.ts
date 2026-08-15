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

  it('fails closed on a malformed blob header', async () => {
    const malformed = Buffer.from(`${FIRST_OBJECT_ID} tree 0\n\n`, 'utf8');

    await expect(scanner(malformed, 7).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('malformed batch blob header');
  });

  it('fails closed on a truncated blob payload', async () => {
    const truncated = Buffer.from(`${FIRST_OBJECT_ID} blob 5\nabc`, 'utf8');

    await expect(scanner(truncated, 2).findLeakingBlobIds([
      FIRST_OBJECT_ID,
    ])).rejects.toThrow('truncated batch blob');
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
});
