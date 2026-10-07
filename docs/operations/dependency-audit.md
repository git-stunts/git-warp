# Locked dependency audit

Run `npm run audit:locked` against a clean installation of the committed lock. The gate audits the complete graph at severity low, including developer tools. A runtime-only audit or an advisory allowlist does not satisfy this gate.

## Reviewed developer-tool overrides

The exact override set is checked by `test/unit/scripts/dependency-hygiene.test.ts`. Unexpected keys or versions fail that check. A newly reviewed security fix must retain caller compatibility evidence and the full audit; the allowlist records resolutions, not ignored advisories.

- `markdownlint-cli` uses `js-yaml` 5.4.2 for the existing reviewed YAML correction.
- `markdownlint-cli` uses `smol-toml` 1.9.0. Its current caller requests ~1.7.0, while the [reviewed advisory](https://github.com/advisories/GHSA-r4xh-jqrq-34v2) fixes quadratic key parsing in 1.9.0. Nested values and the actual CLI TOML configuration path have compatibility witnesses.
- KaTeX uses 0.18.2 across the current developer-tool callers. Their 0.16.x requests exclude the [patched trust-setting behavior](https://github.com/advisories/GHSA-238p-pmpm-9mq7). Tests retain ordinary expressions, explicit trusted links, inherited-trust refusal and mathematical SVG rendering through the real Mermaid worker.

Source-map-js 1.2.2 is an ordinary lock update within the existing ^1.2.1 caller requests, with no override. It resolves the [indexed-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Isolated child witnesses verify refusal of an excessive section offset and bounded preservation of generated code for an accepted mapping beyond the code's end. Child execution and output have explicit limits.

Remove a security override when the upstream caller admits a compatible patched version and a clean installation, complete audit, and the corresponding compatibility witnesses pass without it. Do not remove a pin solely because a newer caller version exists; verify its dependency range. Preserve platform-specific optional-package constraints during lock generation.

The lock correction changes no production dependency version, Git interpretation, or public runtime API. PR and source-specific results belong in their retained evidence and issue, rather than being inferred from this guide.
