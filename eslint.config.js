import js from "@eslint/js";
import tseslint from "typescript-eslint";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Base: recommended + strict-type-checked for src/ and bin/ ────────────────
// Every rule is "error". Zero warnings. Zero tolerance.

export default tseslint.config(
  // ── Global ignores ─────────────────────────────────────────────────────────
  {
    ignores: [
      "node_modules/**",
      "coverage/**",
      "examples/html/assets/**",
      "scripts/**",
    ],
  },

  // ── All JS files: recommended baseline ─────────────────────────────────────
  js.configs.recommended,

  // ── Source + CLI: typed linting (the nuclear option) ────────────────────────
  {
    files: ["src/**/*.js", "bin/**/*.js"],
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
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
    },
    rules: {
      // ── THE RULES THAT WOULD HAVE CAUGHT THE BUG ────────────────────────
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      "@typescript-eslint/require-await": "error",

      // Turn off base rule that conflicts with TS version
      "require-await": "off",

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

      // ── Complexity & structure ───────────────────────────────────────────
      "complexity": ["error", 10],
      "max-depth": ["error", 3],
      "max-lines-per-function": ["error", 50],
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
      "dot-notation": "error",
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

  // ── Relaxed complexity for algorithm-heavy modules ─────────────────────────
  {
    files: [
      "src/domain/services/TraversalService.js",
      "src/domain/services/IndexRebuildService.js",
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
      "src/domain/services/CommitDagTraversalService.js",
      "src/domain/services/CheckpointService.js",
      "src/domain/services/QueryBuilder.js",
      "src/domain/services/WarpMessageCodec.js",
      "src/domain/services/SyncProtocol.js",
      "src/domain/services/LogicalTraversal.js",
      "src/domain/services/StateSerializerV5.js",
      "src/domain/services/PatchBuilderV2.js",
      "src/domain/utils/EventId.js",
      "src/domain/types/WarpTypesV2.js",
      "bin/warp-graph.js",
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
    files: ["src/ports/**/*.js"],
    rules: {
      "@typescript-eslint/require-await": "off",
    },
  },

  // ── JoinReducer: the algorithm from hell ───────────────────────────────────
  {
    files: ["src/domain/services/JoinReducer.js"],
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
    files: ["test/**/*.js", "test/**/*.test.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
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
