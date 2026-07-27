import { Runtime } from '@git-stunts/git-warp';

import { users } from './users.generated.js';

class GeneratedSdkReadSmokeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeneratedSdkReadSmokeError';
  }
}

function requireEqual<TValue>(
  actual: TValue,
  expected: TValue,
  label: string,
): void {
  if (actual !== expected) {
    throw new GeneratedSdkReadSmokeError(
      `${label}: expected ${expected}, received ${actual}`,
    );
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
    throw new GeneratedSdkReadSmokeError(`${label}: expected rejection`);
  }
}

const runtime = await Runtime.open({
  at: './runtime-repo',
  writer: 'generated-sdk-smoke',
});

try {
  const lane = await runtime.lane('users');
  const single = lane.observe(
    users.observers.roleOf({ subject: 'user:alice' }),
  );
  requireEqual((await single.one()).value, 'admin', 'single role observation');
  requireEqual((await single.receipt).status, 'completed', 'single receipt');

  const subjects = ['user:alice', 'user:bob'];
  const many = lane.observe(users.observers.rolesOf({ subjects }));
  subjects[0] = 'user:mallory';
  const values: string[] = [];
  for await (const reading of many) {
    values.push(reading.value);
  }
  requireEqual(values.join(','), 'admin,editor', 'many role observation');
  requireEqual((await many.receipt).status, 'completed', 'many receipt');

  requireThrows(
    () => users.observers.rolesOf({
      subjects: Array.from({ length: 257 }, (_, index) => `user:${index}`),
    }),
    'bounded observer validation',
  );
} finally {
  await runtime.close();
}
