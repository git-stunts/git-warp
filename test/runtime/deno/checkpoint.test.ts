import { assertMatch, assertRejects } from "./assertions.ts";
import { createTestRepo, denoRuntimeTest, GIT_BACKED_RUNTIME_TEST_OPTIONS } from "./helpers.ts";
import SchemaUnsupportedError from "../../../src/domain/errors/SchemaUnsupportedError.ts";

denoRuntimeTest("checkpoint: creates checkpoint with valid SHA", async () => {
  const repo = await createTestRepo("ckpt");
  try {
    const graph = await repo.openGraph("test", "w1");

    await (await graph.createPatch()).addNode("n1").commit();
    await (await graph.createPatch()).addNode("n2").commit();
    await graph.materialize();

    const sha = await graph.createCheckpoint();
    assertMatch(sha, /^[0-9a-f]{40}$/);
  } finally {
    await repo.cleanup();
  }
}, GIT_BACKED_RUNTIME_TEST_OPTIONS);

denoRuntimeTest("checkpoint: materializeAt rejects session-backed runtime checkpoints", async () => {
  const repo = await createTestRepo("ckpt-at");
  try {
    const graph = await repo.openGraph("test", "w1");

    await (await graph.createPatch()).addNode("n1").commit();
    await graph.materialize();
    const sha = await graph.createCheckpoint();

    await assertRejects(
      () => graph.materializeAt(sha),
      SchemaUnsupportedError,
      "offline checkpoint migration",
    );
  } finally {
    await repo.cleanup();
  }
}, GIT_BACKED_RUNTIME_TEST_OPTIONS);
