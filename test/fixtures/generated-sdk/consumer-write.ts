import {
  GitStorage,
  RetainedWriteReceipt,
  Warp,
  WarpAccessPort,
  WarpAddress,
  WarpWriteGrant,
  type WarpWriteRequest,
} from '@git-stunts/git-warp';

import { users } from './users.generated.js';

class GeneratedSdkWriteSmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedSdkWriteSmokeError';
  }
}

function requireThrows(operation: () => void, label: string): void {
  let rejected = false;
  try {
    operation();
  } catch {
    rejected = true;
  }
  if (!rejected) {
    throw new GeneratedSdkWriteSmokeError(`${label}: expected rejection`);
  }
}

requireThrows(
  () => users.intents.assignRole({ subject: '', role: 'admin' }),
  'empty subject validation',
);

class SmokeAccess extends WarpAccessPort {
  override authorizeWrite(request: WarpWriteRequest): Promise<WarpWriteGrant> {
    return Promise.resolve(new WarpWriteGrant({
      authority: `generated-sdk-smoke:${request.writer}`,
      budget: { records: 256, bytes: 1024 * 1024, work: 10_000 },
    }));
  }
}

const warp = await Warp.open(WarpAddress.of(GitStorage.at('./runtime-repo'), 'users'), new SmokeAccess());

try {
  const receipt = await warp.as('generated-sdk-smoke').execute([
    users.intents.registerUser({ subject: 'user:alice' }),
    users.intents.assignRole({
      subject: 'user:alice',
      role: 'admin',
    }),
    users.intents.registerUser({ subject: 'user:bob' }),
    users.intents.assignRole({
      subject: 'user:bob',
      role: 'editor',
    }),
  ]);
  if (!(receipt instanceof RetainedWriteReceipt)) {
    throw new GeneratedSdkWriteSmokeError(`write was not retained: ${receipt.constructor.name}`);
  }
} finally {
  await warp.close();
}
