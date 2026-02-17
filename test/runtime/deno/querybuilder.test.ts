import { assertEquals, assert } from "jsr:@std/assert";
import { createTestRepo } from "./helpers.ts";

Deno.test("query: match glob returns matching nodes", async () => {
  const repo = await createTestRepo("query");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1.addNode("user:alice").addNode("user:bob").addNode("project:x").commit();
    await graph.materialize();

    const result = await graph.query().match("user:*").select(["id"]).run();
    // deno-lint-ignore no-explicit-any
    const ids = result.nodes.map((n: any) => n.id);
    assert(ids.includes("user:alice"));
    assert(ids.includes("user:bob"));
    assert(!ids.includes("project:x"));
  } finally {
    await repo.cleanup();
  }
});

Deno.test("query: where filters by property", async () => {
  const repo = await createTestRepo("query-where");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1
      .addNode("user:a")
      .setProperty("user:a", "role", "eng")
      .addNode("user:b")
      .setProperty("user:b", "role", "mkt")
      .commit();
    await graph.materialize();

    const result = await graph.query().match("user:*").where({ role: "eng" }).select(["id"]).run();
    // deno-lint-ignore no-explicit-any
    const ids = result.nodes.map((n: any) => n.id);
    assertEquals(ids.length, 1);
    assertEquals(ids[0], "user:a");
  } finally {
    await repo.cleanup();
  }
});

Deno.test("query: outgoing traversal", async () => {
  const repo = await createTestRepo("query-out");
  try {
    const graph = await repo.openGraph("test", "alice");

    const p1 = await graph.createPatch();
    await p1.addNode("a").addNode("b").addEdge("a", "b", "follows").commit();
    await graph.materialize();

    const result = await graph.query().match("a").outgoing("follows").select(["id"]).run();
    // deno-lint-ignore no-explicit-any
    const ids = result.nodes.map((n: any) => n.id);
    assertEquals(ids, ["b"]);
  } finally {
    await repo.cleanup();
  }
});
