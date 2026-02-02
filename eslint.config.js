import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
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
        // Node.js 20+ globals
        AbortController: "readonly",
        AbortSignal: "readonly",
        performance: "readonly",
        global: "readonly"
      }
    },
    rules: {
      "complexity": ["error", 10],
      "max-depth": ["error", 3],
      "max-lines-per-function": ["error", 50],
      "max-params": ["error", 3],
      "max-nested-callbacks": ["error", 3],
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
      "no-console": "error",
      "eqeqeq": ["error", "always"],
      "curly": ["error", "all"],
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-wrappers": "error",
      "no-caller": "error",
      "no-undef-init": "error",
      "no-var": "error",
      "prefer-const": "error",
      "prefer-template": "error",
      "yoda": ["error", "never"],
      "consistent-return": "error",
      "no-shadow": "error",
      "no-use-before-define": ["error", { "functions": false }],
      "no-lonely-if": "error",
      "no-unneeded-ternary": "error",
      "one-var": ["error", "never"]
    }
  },
  // Relaxed rules for test files
  {
    files: ["test/**/*.js", "test/**/*.test.js"],
    languageOptions: {
      globals: {
        describe: "readonly",
        it: "readonly",
        expect: "readonly",
        beforeEach: "readonly",
        afterEach: "readonly",
        beforeAll: "readonly",
        afterAll: "readonly",
        vi: "readonly",
        bench: "readonly"
      }
    },
    rules: {
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
      "max-params": "off",
      "complexity": "off",
      "max-depth": "off",
      "no-console": "off",
      "no-shadow": "off",
      "no-unused-vars": "off",
      "prefer-template": "off",
      "curly": "off"
    }
  },
  // Relaxed rules for benchmarks
  {
    files: ["benchmarks/**/*.js"],
    rules: {
      "no-unused-vars": "off",
      "no-console": "off",
      "curly": "off",
      "max-depth": "off",
      "max-params": "off",
      "complexity": "off",
      "prefer-template": "off"
    }
  },
  // Relaxed rules for example scripts (CLI demos)
  {
    files: ["examples/**/*.js"],
    rules: {
      "no-console": "off",
      "max-lines-per-function": "off",
      "complexity": "off"
    }
  },
  // Browser globals for HTML example assets
  {
    files: ["examples/html/assets/**/*.js"],
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        localStorage: "readonly",
        CustomEvent: "readonly",
        Viz: "readonly"
      }
    }
  },
  // Relaxed rules for specific algorithm files (graph algorithms have inherently high complexity)
  {
    files: ["src/domain/services/TraversalService.js", "src/domain/services/IndexRebuildService.js"],
    rules: {
      "complexity": ["error", 35],
      "max-statements": ["error", 100],
      "max-lines-per-function": ["error", 200],
      "max-depth": ["error", 6],
      "max-params": ["error", 6]
    }
  },
  // Relaxed rules for core algorithm-heavy modules
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
      "src/domain/types/WarpTypesV2.js"
    ],
    rules: {
      "complexity": ["error", 35],
      "max-lines-per-function": ["error", 200],
      "max-depth": ["error", 6],
      "max-params": ["error", 6]
    }
  }
];
