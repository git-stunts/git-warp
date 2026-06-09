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
let WarpCore: any;
// deno-lint-ignore no-explicit-any
let WebCryptoAdapter: any;

export function denoRuntimeTest(name: string, fn: () => Promise<void>): void {
  Deno.test({
    name,
    // @git-stunts/alfred timeout policies used through npm Git plumbing leave
    // losing timeout timers alive after fast commands complete under Deno's
    // Node-compat layer. The runtime assertions still run; sanitizer strictness
    // is disabled here until the upstream timeout clock can cancel losing timers.
    sanitizeOps: false,
    sanitizeResources: false,
    fn,
  });
}

export async function loadModules() {
  const root = Deno.cwd();
  const plumbingModule = (await import(join(root, "node_modules/@git-stunts/plumbing/index.js"))).default;
  const gitGraphAdapterModule = (await import(join(root, "src/infrastructure/adapters/GitGraphAdapter.ts"))).default;
  const warpCoreModule = (await import(join(root, "src/domain/WarpCore.ts"))).default;
  const webCryptoAdapterModule = (await import(join(root, "src/infrastructure/adapters/WebCryptoAdapter.ts"))).default;
  Plumbing = plumbingModule;
  GitGraphAdapter = gitGraphAdapterModule;
  WarpCore = warpCoreModule;
  WebCryptoAdapter = webCryptoAdapterModule;
}

export async function createTestRepo(label = "deno-test") {
  if (!Plumbing || !GitGraphAdapter || !WarpCore || !WebCryptoAdapter) {
    await loadModules();
  }

  const tempDir = await mkdtemp(join(tmpdir(), `warp-${label}-`));
  const crypto = new WebCryptoAdapter();

  const plumbing = await Plumbing.createDefault({ cwd: tempDir });
  await plumbing.execute({ args: ["init"] });
  await plumbing.execute({ args: ["config", "user.email", "test@test.com"] });
  await plumbing.execute({ args: ["config", "user.name", "Test"] });
  const persistence = new GitGraphAdapter({ plumbing });

  // deno-lint-ignore no-explicit-any
  async function openGraph(graphName: string, writerId: string, opts: Record<string, any> = {}) {
    return WarpCore.open({
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
