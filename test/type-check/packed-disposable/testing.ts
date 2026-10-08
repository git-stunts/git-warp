import { createRuntimeHarness, type RuntimeHarness } from "@git-stunts/git-warp/testing";
declare const harness: RuntimeHarness;
void harness.runtime.close();
void harness.runtime[Symbol.asyncDispose]();
void createRuntimeHarness;
