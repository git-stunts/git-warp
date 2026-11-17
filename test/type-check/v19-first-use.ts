/** v21 first-use consumer fixture -- compile-only. */

import { GitStorage, Runtime, Warp, WarpAddress, type WarpAccessPort } from '../../index.ts';
import { users } from '../fixtures/generated-sdk/users.generated.ts';

declare const access: WarpAccessPort;
const warp = await Warp.open(WarpAddress.of(GitStorage.root(), 'events'), access);
const writeReceipt = await warp.as('agent-1').execute(users.intents.assignRole({
  subject: 'user:alice',
  role: 'admin',
}));
await warp.close();

const runtime = await Runtime.open({ at: '.', writer: 'agent-1' });
const lane = await runtime.lane('events');
const observation = lane.observe(users.observers.roleOf({ subject: 'user:alice' }));
for await (const reading of observation) {
  const role: string = reading.value;
  void role;
}
const observationReceipt = await observation.receipt;

void writeReceipt.operation;
void observationReceipt.status;
await runtime.close();
