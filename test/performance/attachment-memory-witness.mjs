import process from 'node:process';
import console from 'node:console';
import { ensureDocker } from '@git-stunts/docker-guard';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import Plumbing from '@git-stunts/plumbing';
import GitTimelineHistoryAdapter from '../../dist/src/infrastructure/adapters/GitTimelineHistoryAdapter.js';
import GitCasRepositoryAdapter from '../../dist/src/infrastructure/adapters/GitCasRepositoryAdapter.js';
import WarpCore from '../../dist/src/domain/WarpCore.js';
import WebCryptoAdapter from '../../dist/src/infrastructure/adapters/WebCryptoAdapter.js';
import { DEFAULT_COMMIT_MESSAGE_CODEC } from '../../dist/src/infrastructure/adapters/TrailerCommitMessageCodecAdapter.js';
import CasContentEncryptionPolicy from '../../dist/src/infrastructure/adapters/CasContentEncryptionPolicy.js';
import codec from '../../dist/src/infrastructure/codecs/CborCodec.js';
ensureDocker({ env: { GIT_STUNTS_DOCKER: existsSync('/.dockerenv') ? '1' : '0' } });
const TOTAL = 2 * 1024 * 1024 * 1024;
const CHUNK = 64 * 1024;
const mode = process.argv[2];
if (!['stream', 'framed', 'eager'].includes(mode)) throw new Error('Expected stream, framed, or eager witness mode');
const expectedHash = createHash('sha256');
let produced = 0;
async function* source() {
  for (let offset = 0; offset < TOTAL; offset += CHUNK) {
    const chunk = new Uint8Array(CHUNK).fill((offset / CHUNK) % 251);
    expectedHash.update(chunk);
    produced += chunk.byteLength;
    yield chunk;
  }
}
if (mode === 'eager') {
  const retained = [];
  for await (const chunk of source()) retained.push(chunk);
  console.log({ unexpectedEagerSuccess: retained.length, produced });
  process.exitCode = 1;
} else {
  const directory = await mkdtemp(join(tmpdir(), 'attachment-memory-'));
  const plumbing = await Plumbing.createDefault({ cwd: directory });
  await plumbing.execute({ args: ['init'] });
  await plumbing.execute({ args: ['config', 'user.name', 'Memory witness'] });
  await plumbing.execute({ args: ['config', 'user.email', 'witness@example.invalid'] });
  const persistence = new GitTimelineHistoryAdapter({ plumbing });
  const contentEncryption = mode === 'framed'
    ? CasContentEncryptionPolicy.fromInternalResolvedKey({ encryptionKey: new Uint8Array(32).fill(7), scheme: 'framed', frameBytes: CHUNK })
    : CasContentEncryptionPolicy.disabled();
  const storage = new GitCasRepositoryAdapter({ plumbing, history: persistence, contentEncryption });
  try {
    const graph = await WarpCore.open({ runtimeStorage: storage, stateCache: null, persistence,
      graphName: 'memory', writerId: 'writer', commitMessageCodec: DEFAULT_COMMIT_MESSAGE_CODEC, codec, crypto: new WebCryptoAdapter() });
    const patch = await graph.createPatch();
    patch.addNode('large');
    await patch.attachContent('large', source(), { size: TOTAL });
    await patch.commit();
    await graph.materialize();
    const stream = await graph.getContentStream('large');
    if (stream === null) throw new Error('missing attachment');
    const actualHash = createHash('sha256');
    let drained = 0;
    for await (const chunk of stream) { actualHash.update(chunk); drained += chunk.byteLength; }
    const expected = expectedHash.digest('hex');
    const actual = actualHash.digest('hex');
    if (drained !== TOTAL || produced !== TOTAL || actual !== expected) throw new Error('byte mismatch');
    console.log(JSON.stringify({ mode, produced, drained, sha256: actual, memory: process.memoryUsage() }));
  } finally {
    await storage.close();
    await persistence.close();
    await rm(directory, { recursive: true });
  }
}
