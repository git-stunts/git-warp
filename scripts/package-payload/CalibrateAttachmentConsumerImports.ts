import assert from 'node:assert/strict';
import '../RequireDockerTests.ts';
import attachmentConsumerImports from './AttachmentConsumerImports.ts';

// These source programs are parsed, never executed. A forbidden side effect must
// fail before the fixture can run, even when the import binds no local value.
const FORBIDDEN = [
  'import "/checkout/dist/index.js";',
  'import "../index.ts";',
  'import "file:///checkout/dist/index.js";',
  'import "@git-stunts/git-warp/dist/index.js";',
  'import {\n Runtime\n} from\n "/checkout/dist/index.js";',
  'await import /* spacing */ (\n "/checkout/dist/index.js"\n);',
  'export { Runtime } from "/checkout/dist/index.js";',
  'export * from "@git-stunts/git-warp/storage";',
  'type Runtime = import("../index.ts").Runtime;',
  '/** @param {import("../index.ts").Lane} lane */ function example(lane) {}',
  'import Runtime = require("../index.ts");',
  'const target = "@git-stunts/git-warp"; await import(target);',
  'await import("@git-stunts/" + "git-warp");',
  'await import(`@git-stunts/${name}`);',
  'require("/checkout/dist/index.js");',
  'require(target);',
  'require();',
  'const load = require; load(target);',
  'import { createRequire as load } from "node:module";',
  'eval("import(target)");',
  'new Function("return import(target)");',
  'import "node:nonexistent-built-in";',
  'import "some-other-package";',
];
const ALLOWED = [
  'import { Runtime } from "@git-stunts/git-warp";',
  'import {\n intent\n} from\n "@git-stunts/git-warp/advanced";',
  'import "@git-stunts/git-warp";',
  'export * from "@git-stunts/git-warp/advanced";',
  'await import /* spacing */ ("@git-stunts/git-warp");',
  'await import(`@git-stunts/git-warp/advanced`);',
  'type Lane = import("@git-stunts/git-warp").Lane;',
  'import type { Lane } from "@git-stunts/git-warp";',
  '/** @param {import("@git-stunts/git-warp").Lane} lane */ function example(lane) {}',
  'import assert from "node:assert/strict";',
  'import fs from "node:fs";',
  'require("node:fs");',
];
for (const source of FORBIDDEN) {
  assert.notEqual(attachmentConsumerImports(source, 'calibration.ts').length, 0, source);
}
for (const source of ALLOWED) {
  assert.deepEqual(attachmentConsumerImports(source, 'calibration.ts'), [], source);
}
console.log(`attachment consumer import calibration passed: ${FORBIDDEN.length} refusals, ${ALLOWED.length} allowed`);
