import assert from 'node:assert/strict';
import { stdout } from 'node:process';
import { createRuntimeHarness } from '@git-stunts/git-warp/testing';

for (const mode of ['close', 'dispose', 'concurrent']) {
  const harness = await createRuntimeHarness({ writer: 'disposable-consumer' });
  try {
    const runtime = harness.runtime;
    assert.equal(typeof runtime[Symbol.asyncDispose], 'function');
    if (mode === 'close') {
      const closing = runtime.close();
      assert.equal(runtime.close(), closing);
      await closing;
    } else if (mode === 'dispose') {
      await runtime[Symbol.asyncDispose]();
      await runtime[Symbol.asyncDispose]();
    } else {
      await Promise.all([runtime.close(), runtime[Symbol.asyncDispose](), runtime.close()]);
    }
    await assert.rejects(runtime.lane('closed'), { code: 'E_RUNTIME_CLOSED' });
    stdout.write(`PACKED_DISPOSABLE_LIFECYCLE ${mode} PASS\n`);
  } finally {
    await harness.close();
  }
}
