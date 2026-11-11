// Copied into the isolated consumer by smoke-packed-node-removal.sh: one write through the installed Warp.
import assert from 'node:assert/strict';
import process from 'node:process';
import {
  GitStorage, RetainedWriteReceipt, Warp, WarpAccessPort, WarpAddress, WarpWriteGrant,
} from '@git-stunts/git-warp';
import { intent } from '@git-stunts/git-warp/advanced';

class SmokeAccess extends WarpAccessPort {
  authorizeWrite(request) {
    return Promise.resolve(new WarpWriteGrant({
      authority: `packed-smoke:${request.writer}`,
      budget: { records: 256, bytes: 1024 * 1024, work: 10_000 },
    }));
  }
}

function intentFrom(kind, subject, key, value) {
  switch (kind) {
    case 'entity.add':
      assert.ok(key && value, 'entity.add needs one property key and string value');
      return intent.entity.add({ subject, properties: { [key]: value } });
    case 'node.add': return intent.node.add({ subject });
    case 'node.remove': return intent.node.remove({ subject });
    case 'property.set':
      assert.ok(key && value, 'property.set needs a key and string value');
      return intent.property.set({ subject, key, value });
    default: throw new Error(`unsupported smoke intent: ${kind}`);
  }
}

const [repository, graph, writer, kind, subject, key, value] = process.argv.slice(2);
assert.ok(repository && graph && writer && kind && subject,
  'Usage: node packed-warp-write.mjs <repo> <graph> <writer> <kind> <subject> [key value]');
const warp = await Warp.open(WarpAddress.of(GitStorage.at(repository), graph), new SmokeAccess());
try {
  const receipt = await warp.as(writer).execute(intentFrom(kind, subject, key, value));
  assert.ok(receipt instanceof RetainedWriteReceipt, `write was not retained: ${receipt.constructor.name}`);
  assert.equal(receipt.outcome.kind, 'derived');
  process.stdout.write('{"outcome":{"kind":"derived"}}\n');
} finally {
  await warp.close();
}
