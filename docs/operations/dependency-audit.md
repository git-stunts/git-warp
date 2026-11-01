# Locked dependency audit

Run `npm run audit:locked` against a clean installation of the committed lock. The gate audits the complete graph at severity low, including developer tools. A runtime-only audit or an advisory allowlist does not satisfy this gate.

## Lock regeneration

The declared installer remains npm 10. Its optional-peer resolver can fail with `Cannot read properties of null (reading 'edgesOut')` while resolving Vite's development tools. If that occurs, generate the lock with an isolated npm 11.21.1 invocation inside the existing COPY-based Docker worker:

```sh
npm exec --yes --package=npm@11.21.1 -- npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

This command only generates dependency metadata. Follow it with a clean `npm ci` using the declared npm 10 toolchain, with lifecycle scripts enabled, then the relevant validation and full audit. Do not change the global npm installation, disable peer resolution, or treat successful lock generation as a successful installation. Preserve the optional platform packages in the resulting lock. When upgrading a tightly coupled peer family, the old lock can also make npm report incompatible old and new family members together. Regenerate that family’s stale lock metadata in a disposable copy, retain unrelated resolutions, and let npm resolve the replacement graph. Never hand-author package integrity values or accept unresolved peers; verify the complete result with a normal clean install.

## Reviewed developer-tool overrides

The exact override set is checked by `test/unit/scripts/dependency-hygiene.test.ts`. Unexpected keys or versions fail that check. A newly reviewed security fix must retain caller compatibility evidence and the full audit; the allowlist records resolutions, not ignored advisories.

- `markdownlint-cli` uses `js-yaml` 5.4.2 for the existing reviewed YAML correction.
- `markdownlint-cli` uses `smol-toml` 1.9.0. Its current caller requests ~1.7.0, while the [reviewed advisory](https://github.com/advisories/GHSA-r4xh-jqrq-34v2) fixes quadratic key parsing in 1.9.0. Nested values and the actual CLI TOML configuration path have compatibility witnesses.
- KaTeX uses 0.18.2 across the current developer-tool callers. Their 0.16.x requests exclude the [patched trust-setting behavior](https://github.com/advisories/GHSA-238p-pmpm-9mq7). Tests retain ordinary expressions, explicit trusted links, inherited-trust refusal and mathematical SVG rendering through the real Mermaid worker.
- ESLint, its configuration-array reader, the TypeScript parser, and Markdownlint use minimatch 11.0.3. The [pattern-amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) requires minimatch 11. ESLint 10 removes the older default-export callers that cannot accept that version; typescript-eslint 8.56.1 declares ESLint 10 support. Keep the existing `@eslint/js` 9 recommended-rule baseline until a separate policy change reviews new rules. Development linting requires Node 22.13 or later on the Node 22 line; the published runtime requirement is unchanged.
- The package tracer `@vercel/nft` uses glob 14.0.3 to stop filesystem traversal after an aborted asynchronous walk. Its current glob 13 range excludes the [cancellation fix](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). `test/unit/scripts/dependency-glob-compatibility.test.ts` exercises the real tracer with dynamically selected assets, ESLint with JavaScript and TypeScript inputs, and Markdownlint with inclusion and exclusion globs. Separate bounded child witnesses cover matcher expansion limits and cancellation during the first directory read.

Source-map-js 1.2.2 is an ordinary lock update within the existing ^1.2.1 caller requests, with no override. It resolves the [indexed-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Isolated child witnesses verify refusal of an excessive section offset and bounded preservation of generated code for an accepted mapping beyond the code's end. Child execution and output have explicit limits.

Remove a security override when the upstream caller admits a compatible patched version and a clean installation, complete audit, and the corresponding compatibility witnesses pass without it. Do not remove a pin solely because a newer caller version exists; verify its dependency range. Preserve platform-specific optional-package constraints during lock generation.

The lock correction changes no production dependency version, Git interpretation, or public runtime API. PR and source-specific results belong in their retained evidence and issue, rather than being inferred from this guide.
