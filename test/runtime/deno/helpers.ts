/**
 * Shared Deno test helpers.
 * Uses npm: specifiers for git-warp imports.
 */
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Use relative imports from the project root
// deno-lint-ignore no-explicit-any
let Plumbing: any;
// deno-lint-ignore no-explicit-any
let GitGraphAdapter: any;
// deno-lint-ignore no-explicit-any
let WarpGraph: any;
// deno-lint-ignore no-explicit-any
let WebCryptoAdapter: any;

export async function loadModules() {
  const root = Deno.cwd();
  Plumbing = (await import(join(root, "node_modules/@git-stunts/plumbing/index.js"))).default;
  GitGraphAdapter = (await import(join(root, "src/infrastructure/adapters/GitGraphAdapter.js"))).default;
  WarpGraph = (await import(join(root, "src/domain/WarpGraph.js"))).default;
  WebCryptoAdapter = (await import(join(root, "src/infrastructure/adapters/WebCryptoAdapter.js"))).default;
}

export async function createTestRepo(label = "deno-test") {
  if (!Plumbing) {
    await loadModules();
  }

  const tempDir = await mkdtemp(join(tmpdir(), `warp-${label}-`));
  const crypto = new WebCryptoAdapter();

  const plumbing = Plumbing.createDefault({ cwd: tempDir });
  await plumbing.execute({ args: ["init"] });
  await plumbing.execute({ args: ["config", "user.email", "test@test.com"] });
  await plumbing.execute({ args: ["config", "user.name", "Test"] });
  const persistence = new GitGraphAdapter({ plumbing });

  // deno-lint-ignore no-explicit-any
  async function openGraph(graphName: string, writerId: string, opts: Record<string, any> = {}) {
    return WarpGraph.open({
      ...opts,
      persistence,
      graphName,
      writerId,
      crypto,
    });
  }

  return {
    persistence,
    tempDir,
    crypto,
    openGraph,
    async cleanup() {
      await rm(tempDir, { recursive: true, force: true });
    },
  };
}
