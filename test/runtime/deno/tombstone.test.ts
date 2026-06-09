import { assertEquals, assert } from "./assertions.ts";
import { createTestRepo, denoRuntimeTest, GIT_BACKED_RUNTIME_TEST_OPTIONS } from "./helpers.ts";

denoRuntimeTest("tombstone: removeNode hides node", async () => {
  const repo = await createTestRepo("tomb");
  try {
    const graph = await repo.openGraph("test", "alice");

    await (await graph.createPatch()).addNode("temp").commit();
    await graph.materialize();
    assert(await graph.hasNode("temp"));

    await (await graph.createPatch()).removeNode("temp").commit();
    await graph.materialize();
    assertEquals(await graph.hasNode("temp"), false);
  } finally {
    await repo.cleanup();
  }
}, GIT_BACKED_RUNTIME_TEST_OPTIONS);

denoRuntimeTest("tombstone: re-add after removal", async () => {
  const repo = await createTestRepo("tomb-re");
  try {
    const graph = await repo.openGraph("test", "alice");

    await (await graph.createPatch()).addNode("phoenix").commit();
    await graph.materialize();
    await (await graph.createPatch()).removeNode("phoenix").commit();
    await graph.materialize();
    assertEquals(await graph.hasNode("phoenix"), false);

    await (await graph.createPatch()).addNode("phoenix").commit();
    await graph.materialize();
    assert(await graph.hasNode("phoenix"));
  } finally {
    await repo.cleanup();
  }
}, GIT_BACKED_RUNTIME_TEST_OPTIONS);
