/** v19 first-use consumer fixture -- compile-only. */

import { Runtime } from '../../index.ts';
import { users } from './generated-users.ts';

const runtime = await Runtime.open({ at: '.', writer: 'agent-1' });
const lane = await runtime.lane('events');

const writeReceipt = await lane.write(users.intents.assignRole({
  subject: 'user:alice',
  role: 'admin',
}));

const observation = lane.observe(users.observers.roleOf({ subject: 'user:alice' }));
for await (const reading of observation) {
  const role: string = reading.value;
  void role;
}
const observationReceipt = await observation.receipt;

void writeReceipt.outcome;
void observationReceipt.status;
await runtime.close();
