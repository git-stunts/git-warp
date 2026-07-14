/**
 * v19 first-use consumer fixture -- compile-only.
 *
 * This fixture intentionally imports only the root first-use verbs and storage
 * subpath adapter. Graph-first compatibility nouns are not public in v19.
 */

import { intent, openWarp, reading } from '../../index.ts';
import { MemoryStorage } from '../../storage.ts';

const warp = await openWarp({
  storage: MemoryStorage.create(),
  writer: 'agent-1',
});
const timeline = await warp.timeline('events');

await timeline.write(intent.node.add({ subject: 'user:alice' }));
await timeline.write(intent.property.set({
  subject: 'user:alice',
  key: 'role',
  value: 'admin',
}));

const role = await timeline.read(reading.property({
  subject: 'user:alice',
  key: 'role',
}));
const userExists = await timeline.read(reading.node.exists({
  subject: 'user:alice',
}));

void role.value;
void role.receipt;
void userExists.value;
void userExists.receipt;
