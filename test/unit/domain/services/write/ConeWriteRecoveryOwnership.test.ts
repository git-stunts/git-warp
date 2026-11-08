import { describe, expect, it, vi } from 'vitest';
import UnsupportedWriteAttemptLayoutError from '../../../../../src/domain/errors/UnsupportedWriteAttemptLayoutError.ts';
import type ObservationCustodyService from '../../../../../src/domain/services/custody/ObservationCustodyService.ts';
import ConeWriteRecovery from '../../../../../src/domain/services/write/ConeWriteRecovery.ts';
import type ConeWriteSettlement from '../../../../../src/domain/services/write/ConeWriteSettlement.ts';
import type WritePublicationProbe from '../../../../../src/domain/services/write/WritePublicationProbe.ts';
import type WriteAttemptJournalPort from '../../../../../src/ports/WriteAttemptJournalPort.ts';

const ATTEMPT = 'a'.repeat(32);
const REF = `refs/warp/g/write-attempts/${ATTEMPT}`;

function recovery(read: () => Promise<null>): { readonly recovering: ConeWriteRecovery; readonly resume: ReturnType<typeof vi.fn> } {
  const resume = vi.fn();
  return {
    resume,
    recovering: new ConeWriteRecovery({
      graph: 'g', clock: () => 1,
      custody: { resume } as unknown as ObservationCustodyService,
      journal: { read } as unknown as WriteAttemptJournalPort,
      probe: {} as WritePublicationProbe,
      settlement: {} as ConeWriteSettlement,
    }),
  };
}

describe('reconciling an attempt saved in a layout this build cannot read', () => {
  const unsupported = (): Promise<null> => Promise.reject(new UnsupportedWriteAttemptLayoutError({ ref: REF, version: 1, writer: 'alice' }));

  it('answers null to any other writer, so the refusal reveals nothing of another writer\'s attempt', async () => {
    const { recovering, resume } = recovery(unsupported);

    await expect(recovering.reconcile('mallory', ATTEMPT)).resolves.toBeNull();
    expect(resume).not.toHaveBeenCalled();
  });

  it('refuses its own writer with the error that names the ref', async () => {
    const { recovering } = recovery(unsupported);

    await expect(recovering.reconcile('alice', ATTEMPT)).rejects.toThrow(UnsupportedWriteAttemptLayoutError);
  });

  it('lets any other read failure through, whoever asks', async () => {
    const { recovering } = recovery(() => Promise.reject(new Error('store went away')));

    await expect(recovering.reconcile('mallory', ATTEMPT)).rejects.toThrow('store went away');
  });
});
