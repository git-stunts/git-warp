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
        TextEncoder: "readonly"
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
      "no-console": "off"
    }
  },
  // Relaxed rules for benchmarks
  {
    files: ["benchmarks/**/*.js"],
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": "off",
      "curly": "off"
    }
  }
];
