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

function intentFrom(request) {
  switch (request.kind) {
    case 'entity.add': return intent.entity.add({ subject: request.subject, properties: request.properties });
    case 'node.add': return intent.node.add({ subject: request.subject });
    case 'node.remove': return intent.node.remove({ subject: request.subject });
    case 'property.set': return intent.property.set({ subject: request.subject, key: request.key, value: request.value });
    default: throw new Error(`unsupported smoke intent: ${request.kind}`);
  }
}

const [repository, graph, writer, request] = process.argv.slice(2);
assert.ok(repository && graph && writer && request, 'Usage: node packed-warp-write.mjs <repo> <graph> <writer> <intent-json>');
const warp = await Warp.open(WarpAddress.of(GitStorage.at(repository), graph), new SmokeAccess());
try {
  const receipt = await warp.as(writer).execute(intentFrom(JSON.parse(request)));
  assert.ok(receipt instanceof RetainedWriteReceipt, `write was not retained: ${receipt.constructor.name}`);
  process.stdout.write(`${JSON.stringify({ outcome: { kind: receipt.outcome.kind } })}\n`);
} finally {
  await warp.close();
}
