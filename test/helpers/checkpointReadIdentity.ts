import type { OpticReadIdentity } from '../../src/domain/services/optic/OpticReadIdentity.ts';
import ReadIdentity from '../../src/domain/services/optic/ReadIdentity.ts';

/** Narrows a read witness to the checkpoint-tail identity a compatibility graph handle produces. */
export function checkpointReadIdentity(identity: OpticReadIdentity | undefined): ReadIdentity {
  if (!(identity instanceof ReadIdentity)) {
    throw new Error('expected a checkpoint-tail read identity');
  }
  return identity;
}
