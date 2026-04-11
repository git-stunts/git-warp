import js from "@eslint/js";
import tseslint from "typescript-eslint";
import jsdoc from "eslint-plugin-jsdoc";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Base: recommended + strict-type-checked + JSDoc for src/ and bin/ ────────
// Every rule is "error". Zero warnings. Zero tolerance. Maximum pain.

export default tseslint.config(
  // ── Global ignores ─────────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "examples/html/assets/**",
      "scripts/**",
      ".claude/**",
      "test/type-check/**",
      "test/runtime/**",
      "**/*.d.ts",
    ],
  },

  // ── All JS files: recommended baseline ─────────────────────────────────────
  js.configs.recommended,

  // NOTE: strictTypeChecked and stylisticTypeChecked presets are applied
  // only to src/ and bin/ files via the parser/rules block below, not globally.
  // Global application crashes on files without type info (benchmarks, etc.).

  // ── Source + CLI: typed linting (the nuclear option) ────────────────────────
  {
    files: ["src/**/*.js", "src/**/*.ts", "bin/**/*.js", "bin/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "src/visualization/index.js",
          ],
        },
        tsconfigRootDir: __dirname,
      },
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        fetch: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        performance: "readonly",
        global: "readonly",
        WebSocket: "readonly",
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      jsdoc,
    },
    rules: {
      // ── THE RULES THAT WOULD HAVE CAUGHT THE BUG ────────────────────────
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",

      // Turn off base rule that conflicts with TS version
      "require-await": "off",

      // ── IRONCLAD: ban explicit `any` in type annotations ────────────────
      "@typescript-eslint/no-explicit-any": "error",

      // ── TYPE-AWARE: no-unsafe-* disabled ──────────────────────────────
      // Runtime-backed classes with constructor validation ARE the type
      // system. tsc cannot follow JSDoc types across module boundaries,
      // producing false positives on correct code. See cycle 0012 retro.
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/strict-boolean-expressions": ["error", { allowAny: true }],
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "@typescript-eslint/only-throw-error": "error",

      // ── More typed rules ─────────────────────────────────────────────────
      "@typescript-eslint/no-unnecessary-type-assertion": "error",
      "@typescript-eslint/no-redundant-type-constituents": "error",
      "@typescript-eslint/restrict-plus-operands": "error",
      "@typescript-eslint/no-base-to-string": "error",
      "@typescript-eslint/no-duplicate-type-constituents": "error",
      "@typescript-eslint/unbound-method": "error",
      "@typescript-eslint/no-for-in-array": "error",
      "@typescript-eslint/no-unnecessary-boolean-literal-compare": "error",
      "@typescript-eslint/return-await": ["error", "always"],

      // ── JSDoc BRUTALITY ─────────────────────────────────────────────────
      "jsdoc/require-jsdoc": ["error", {
        require: { FunctionDeclaration: true, MethodDefinition: true, ArrowFunctionExpression: true },
      }],
      "jsdoc/require-description": "error",
      "jsdoc/valid-types": "error",

      // ── CUSTOM ERROR TIER: no raw Errors ────────────────────────────────
      // IMPORTANT: In ESLint flat config, multiple blocks setting
      // `no-restricted-syntax` REPLACE rather than merge — the last
      // matching block wins per rule. The domain purity block below
      // (at files: src/domain/**) MUST re-list every selector from
      // this block plus its own Date/Math/timer bans, or the bans here
      // will silently disappear in domain code. See eslint.config.js
      // lines ~385 onward.
      "no-restricted-syntax": ["error",
        {
          "selector": "NewExpression[callee.name='Error']",
          "message": "Zero-slop policy: Do not throw raw Errors. Create and instantiate a domain error class extending WarpError.",
        },
        {
          "selector": "NewExpression[callee.name='TypeError']",
          "message": "Zero-slop policy: Do not throw raw TypeErrors. Use a domain error class extending WarpError with a structured `code` field.",
        },
        {
          "selector": "MethodDefinition[kind='constructor'] > FunctionExpression > AssignmentPattern[left.type='ObjectPattern'][right.type='ObjectExpression'][right.properties.length=0]",
          "message": "Avoid `constructor({ ... } = {})`. Accept an `options` parameter and destructure inside the constructor body so optionality stays explicit in JSDoc and type checking.",
        },
      ],

      // ── Complexity & structure (MAXIMUM PAIN) ───────────────────────────
      "complexity": ["error", 5],
      "max-depth": ["error", 3],
      "max-lines-per-function": ["error", 30],
      "max-params": ["error", 3],
      "max-nested-callbacks": ["error", 3],

      // ── Variables ────────────────────────────────────────────────────────
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-var": "error",
      "prefer-const": "error",
      "no-shadow": "off",
      "@typescript-eslint/no-shadow": "error",
      "no-use-before-define": "off",
      "@typescript-eslint/no-use-before-define": ["error", { "functions": false }],
      "no-undef-init": "error",
      "one-var": ["error", "never"],

      // ── Equality & types ─────────────────────────────────────────────────
      "eqeqeq": ["error", "always"],
      "no-implicit-coercion": ["error", { "allow": ["!!"] }],
      "no-new-wrappers": "error",

      // ── Control flow ─────────────────────────────────────────────────────
      "curly": ["error", "all"],
      "consistent-return": "error",
      "default-case": "error",
      "default-case-last": "error",
      "no-lonely-if": "error",
      "no-else-return": ["error", { "allowElseIf": false }],
      "no-unneeded-ternary": "error",
      "no-useless-return": "error",
      "yoda": ["error", "never"],

      // ── Functions ────────────────────────────────────────────────────────
      "no-caller": "error",
      "no-extra-bind": "error",
      "no-loop-func": "error",
      "no-param-reassign": "error",
      "prefer-arrow-callback": "error",
      "prefer-rest-params": "error",
      "prefer-spread": "error",
      "arrow-body-style": ["error", "as-needed"],

      // ── Objects & arrays ─────────────────────────────────────────────────
      "no-array-constructor": "error",
      "no-object-constructor": "error",
      "object-shorthand": ["error", "always"],
      "prefer-object-spread": "error",
      "prefer-destructuring": ["error", {
        "VariableDeclarator": { "array": false, "object": true },
        "AssignmentExpression": { "array": false, "object": false },
      }],
      "no-useless-computed-key": "error",
      "no-useless-rename": "error",
      // Base dot-notation off; type-aware version below respects noPropertyAccessFromIndexSignature
      "dot-notation": "off",
      "@typescript-eslint/dot-notation": "error",
      "grouped-accessor-pairs": ["error", "getBeforeSet"],
      "accessor-pairs": "error",

      // ── Strings & templates ──────────────────────────────────────────────
      "prefer-template": "error",
      "no-useless-concat": "error",
      "no-multi-str": "error",

      // ── Classes ──────────────────────────────────────────────────────────
      "no-constructor-return": "error",
      "no-useless-constructor": "error",

      // ── Modules ──────────────────────────────────────────────────────────
      "no-duplicate-imports": "error",

      // ── Security & dangerous patterns ────────────────────────────────────
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-script-url": "error",
      "no-proto": "error",
      "no-extend-native": "error",
      "no-iterator": "error",
      "no-labels": "error",
      "no-extra-label": "error",
      "no-with": "error",
      "no-void": ["error", { "allowAsStatement": true }],
      "no-console": "error",

      // ── Catch blocks (B126: documents intent — already active via eslint:recommended) ──
      "no-empty": ["error", { "allowEmptyCatch": false }],

      // ── Correctness ──────────────────────────────────────────────────────
      "no-self-compare": "error",
      "no-template-curly-in-string": "error",
      "no-unreachable-loop": "error",
      "no-promise-executor-return": "error",
      "no-constant-binary-expression": "error",
      "no-new": "error",
      "no-return-assign": ["error", "always"],
      "no-sequences": "error",
      "no-throw-literal": "error",
      "no-multi-assign": "error",
      "no-useless-call": "error",
      "symbol-description": "error",
      "prefer-numeric-literals": "error",
      "radix": "error",
      "no-loss-of-precision": "error",
    },
  },

  // ── TypeScript source: re-enable no-unsafe-* (works in real .ts) ───────────
  {
    files: ["src/**/*.ts", "bin/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unsafe-assignment": "error",
      "@typescript-eslint/no-unsafe-member-access": "error",
      "@typescript-eslint/no-unsafe-return": "error",
      "@typescript-eslint/no-unsafe-call": "error",
      "@typescript-eslint/strict-boolean-expressions": "error",

      // JSDoc rules not needed in .ts — types are in the syntax
      "jsdoc/require-jsdoc": "off",
      "jsdoc/require-description": "off",
      "jsdoc/valid-types": "off",
    },
  },

  // ── Relaxed complexity for algorithm-heavy modules ─────────────────────────
  {
    files: [
      "src/domain/services/index/IndexRebuildService.js",
      "src/domain/services/MaterializedViewService.js",
      // JoinReducer-family files extracted from the original god class.
      // These inherit its algorithmic density: concerns-per-file is low,
      // but branching complexity and parameter counts are intrinsic.
      "src/domain/services/DiffCalculator.ts",
      "src/domain/services/ReceiptBuilder.ts",
      "src/domain/services/OpStrategies.ts",
      "src/domain/services/OpValidator.ts",
      "src/domain/services/state/WarpState.ts",
    ],
    rules: {
      "complexity": ["error", 35],
      "max-lines-per-function": ["error", 200],
      "max-depth": ["error", 6],
      "max-params": ["error", 6],
    },
  },
  {
    files: [
      "src/domain/WarpGraph.js",
      "src/domain/services/controllers/QueryController.js",
      "src/domain/services/controllers/SubscriptionController.js",
      "src/domain/services/controllers/ProvenanceController.js",
      "src/domain/services/controllers/ForkController.js",
      "src/domain/services/controllers/PatchController.js",
      "src/domain/services/controllers/CheckpointController.js",
      "src/domain/services/controllers/MaterializeController.js",
      "src/domain/services/dag/CommitDagTraversalService.js",
      "src/domain/services/state/CheckpointService.js",
      "src/domain/services/query/QueryBuilder.js",
      "src/domain/services/codec/WarpMessageCodec.ts",
      "src/domain/services/codec/PatchMessageCodec.ts",
      "src/domain/services/codec/CheckpointMessageCodec.ts",
      "src/domain/services/codec/AnchorMessageCodec.ts",
      "src/domain/services/codec/MessageSchemaDetector.ts",
      "src/domain/services/controllers/SyncController.js",
      "src/domain/services/sync/SyncProtocol.js",
      "src/domain/services/query/LogicalTraversal.js",
      "src/domain/services/state/StateSerializerV5.js",
      "src/domain/services/PatchBuilder.js",
      "src/domain/warp/PatchSession.ts",
      "src/domain/utils/EventId.ts",
      "src/domain/types/WorldlineSelector.ts",
      "src/visualization/renderers/ascii/graph.js",
      "src/domain/services/KeyCodec.js",
      "src/domain/services/dag/DagTraversal.js",
      "src/domain/services/dag/DagPathFinding.js",
      "src/domain/services/dag/DagTopology.js",
      "src/domain/services/query/GraphTraversal.js",
      "src/domain/services/codec/AuditMessageCodec.ts",
      "src/domain/services/audit/AuditReceiptService.js",
      "src/domain/services/audit/AuditVerifierService.js",
      "src/domain/trust/TrustStateBuilder.js",
      "src/domain/trust/TrustEvaluator.js",
      "src/domain/trust/TrustRecordService.js",
      "bin/warp-graph.js",
      "bin/cli/infrastructure.js",
      "bin/cli/shared.js",
      "bin/cli/commands/info.js",
      "bin/cli/commands/query.js",
      "bin/cli/commands/materialize.js",
      "bin/cli/commands/verify-audit.js",
      "bin/cli/commands/trust.js",
      "bin/cli/commands/view.js",
      "bin/cli/commands/seek.js",
      "bin/cli/commands/patch.js",
      "bin/cli/commands/tree.js",
      "bin/presenters/text.js",
      "src/domain/services/index/LogicalBitmapIndexBuilder.js",
      "src/domain/services/index/LogicalIndexBuildService.js",
      "src/domain/services/index/IncrementalIndexUpdater.js",
      "src/domain/services/WormholeService.js",
      "src/domain/services/state/StateReaderV5.js",
      "src/domain/services/sync/SyncAuthService.js",
      "src/infrastructure/adapters/GitGraphAdapter.js",
      "src/infrastructure/adapters/CborCheckpointStoreAdapter.js",
      "src/infrastructure/adapters/CborPatchJournalAdapter.js",
      "src/infrastructure/adapters/IndexShardEncodeTransform.js",
      "src/domain/stream/WarpStream.ts",
      "src/domain/artifacts/IndexShard.ts",
      "src/visualization/renderers/ascii/path.js",
      "src/domain/services/strand/StrandService.js",
      "src/domain/services/query/AdjacencyNeighborProvider.js",
      "src/domain/services/index/BitmapIndexBuilder.js",
      "src/domain/services/index/BitmapNeighborProvider.js",
      "src/domain/services/state/CheckpointSerializerV5.js",
      "bin/cli/commands/bisect.js",
      "bin/cli/commands/verify-index.js",
      "src/domain/services/strand/ConflictAnalysisRequest.js",
      "src/domain/services/strand/ConflictCandidateCollector.js",
      "src/domain/services/strand/ConflictTraceAssembler.js",
    ],
    rules: {
      "complexity": ["error", 35],
      "max-lines-per-function": ["error", 200],
      "max-depth": ["error", 6],
      "max-params": ["error", 6],
    },
  },

  // ── Port contracts: async is the interface, not the implementation ──────────
  {
    files: ["src/ports/**/*.js", "src/ports/**/*.ts"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },

  // ── Domain purity: ban Buffer — use Uint8Array + helpers from domain/utils/bytes.js ──
  {
    files: ["src/domain/**/*.js", "src/domain/**/*.ts"],
    rules: {
      "no-restricted-globals": ["error",
        { "name": "Buffer", "message": "Use Uint8Array + helpers from domain/utils/bytes.js. Buffer is confined to infrastructure adapters." },
      ],
      "no-restricted-imports": ["error", {
        "paths": [
          {
            "name": "node:buffer",
            "message": "Use Uint8Array + helpers from domain/utils/bytes.js. Buffer is confined to infrastructure adapters.",
          },
          {
            "name": "buffer",
            "message": "Use Uint8Array + helpers from domain/utils/bytes.js. Buffer is confined to infrastructure adapters.",
          },
        ],
      }],
    },
  },

  // ── Domain purity: ban all non-deterministic globals ─────────────────────
  // The domain layer must be fully deterministic and reproducible.
  // All external state (time, randomness, I/O scheduling) must flow
  // through injected ports, never accessed directly.
  //
  // NOTE: This block's `no-restricted-syntax` array REPLACES the one
  // in the src/** block above (flat-config rule values don't merge).
  // It must re-list every selector from the generic src/** block
  // (raw Error, raw TypeError, constructor object-default) PLUS its
  // own Date/Math/timer bans — otherwise the generic bans silently
  // disappear in src/domain. If you add a new selector in either
  // block, add it here too. See docs/method/backlog/cool-ideas/
  // DX_domain-error-strict-lint.md for history.
  {
    files: ["src/domain/**/*.js", "src/domain/**/*.ts"],
    rules: {
      "no-restricted-syntax": ["error",
        // ── Raw Errors (inherited from generic src/** block) ──
        {
          "selector": "NewExpression[callee.name='Error']",
          "message": "Zero-slop policy: Do not throw raw Errors. Create and instantiate a domain error class extending WarpError.",
        },
        {
          "selector": "NewExpression[callee.name='TypeError']",
          "message": "Zero-slop policy: Do not throw raw TypeErrors. Use a domain error class extending WarpError with a structured `code` field.",
        },
        {
          "selector": "MethodDefinition[kind='constructor'] > FunctionExpression > AssignmentPattern[left.type='ObjectPattern'][right.type='ObjectExpression'][right.properties.length=0]",
          "message": "Avoid `constructor({ ... } = {})`. Accept an `options` parameter and destructure inside the constructor body so optionality stays explicit in JSDoc and type checking.",
        },
        // ── Wall clock ──
        {
          "selector": "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          "message": "Date.now() is banned in domain code. Inject timestamps via ClockPort or parameters.",
        },
        {
          "selector": "NewExpression[callee.name='Date']",
          "message": "new Date() is banned in domain code. Inject timestamps via ClockPort or parameters.",
        },
        {
          "selector": "CallExpression[callee.name='Date']",
          "message": "Date() is banned in domain code. Inject timestamps via ClockPort or parameters.",
        },
        // ── Randomness ──
        {
          "selector": "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          "message": "Math.random() is banned in domain code. Use a seeded PRNG or inject randomness via a port.",
        },
        // ── Performance timing ──
        {
          "selector": "CallExpression[callee.object.name='performance'][callee.property.name='now']",
          "message": "performance.now() is banned in domain code. Inject timing via ClockPort.",
        },
        // ── Timers ──
        {
          "selector": "CallExpression[callee.name='setTimeout']",
          "message": "setTimeout is banned in domain code. Use async patterns or inject a scheduler.",
        },
        {
          "selector": "CallExpression[callee.name='setInterval']",
          "message": "setInterval is banned in domain code. Use async patterns or inject a scheduler.",
        },
      ],
    },
  },

  // ── JoinReducer: the algorithm from hell ───────────────────────────────────
  {
    files: ["src/domain/services/JoinReducer.js", "src/domain/services/JoinReducer.ts"],
    rules: {
      "complexity": ["error", 35],
      "max-lines-per-function": ["error", 200],
      "max-depth": ["error", 6],
      "max-params": ["error", 6],
      "no-param-reassign": "off",
    },
  },

  // ── Test files: keep strict but relax structure rules ──────────────────────
  {
    files: ["test/**/*.js", "test/**/*.ts", "test/**/*.test.js", "test/**/*.test.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      parser: tseslint.parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        AbortController: "readonly",
        AbortSignal: "readonly",
        fetch: "readonly",
        URL: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        performance: "readonly",
        global: "readonly",
        Headers: "readonly",
        ReadableStream: "readonly",
        Request: "readonly",
        Response: "readonly",
        WebSocket: "readonly",
        queueMicrotask: "readonly",
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        bench: "readonly",
      },
    },
    rules: {
      // Structure: tests can be long and nested
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
      "max-params": "off",
      "complexity": "off",
      "max-depth": "off",

      // Tests need console, shadow, unused setup vars
      "no-console": "off",
      "no-shadow": "off",
      "no-unused-vars": "off",

      // Tests use flexible patterns
      "prefer-template": "off",
      "curly": "off",
      "no-new": "off",
      "prefer-destructuring": "off",
      "no-param-reassign": "off",
      "no-throw-literal": "off",
      "prefer-arrow-callback": "off",
      "arrow-body-style": "off",
      "no-empty-function": "off",
    },
  },

  // ── Benchmarks ─────────────────────────────────────────────────────────────
  {
    files: ["benchmarks/**/*.js", "test/benchmark/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        performance: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "no-unused-vars": "off",
      "no-console": "off",
      "curly": "off",
      "max-depth": "off",
      "max-params": "off",
      "complexity": "off",
      "prefer-template": "off",
      "max-lines-per-function": "off",
    },
  },

  // ── Example scripts ────────────────────────────────────────────────────────
  {
    files: ["examples/**/*.js"],
    languageOptions: {
      globals: {
        process: "readonly",
        Buffer: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        performance: "readonly",
        global: "readonly",
      },
    },
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      "complexity": "off",
      "no-unused-vars": "off",
    },
  },

  // ── Browser globals for HTML example assets ────────────────────────────────
  {
    files: ["examples/html/assets/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        CustomEvent: "readonly",
        Viz: "readonly",
      },
    },
  },
);
