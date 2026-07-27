import { Runtime } from '@git-stunts/git-warp';

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

const runtime = await Runtime.open({
  at: './runtime-repo',
  writer: 'generated-sdk-smoke',
});

try {
  const lane = await runtime.lane('users');
  await lane.write(users.intents.registerUser({ subject: 'user:alice' }));
  await lane.write(users.intents.assignRole({
    subject: 'user:alice',
    role: 'admin',
  }));
  await lane.write(users.intents.registerUser({ subject: 'user:bob' }));
  await lane.write(users.intents.assignRole({
    subject: 'user:bob',
    role: 'editor',
  }));
} finally {
  await runtime.close();
}
