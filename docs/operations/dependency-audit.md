# Locked dependency audit

Run `npm run audit:locked` against a clean installation of the committed lock. The gate runs `npm audit` at severity low twice: over the published tree (`--omit=dev`) and over the complete lock, including developer tools. Any advisory in the published tree fails the gate, and no exception can change that. A development-only advisory fails the gate unless a reviewed, expiring exception in `policy/audit-exceptions.json` lists it. CI runs the gate in the `type-firewall-audit` job, and `scripts/release-preflight.sh` runs it before a release.

## Development-dependency exceptions

> **Caution:** An exception weakens the full-lock audit. It lets a developer tool with a known advisory stay in the lock for up to 30 days. Add one only when the advisory cannot reach a consumer and no patched version of the vulnerable package is published.

An exception is one entry in `policy/audit-exceptions.json`:

```json
{
  "exceptions": [
    {
      "advisory": "GHSA-fc5q-39xc-vjpf",
      "package": "picomatch",
      "reason": "dev-only (vite/vitest/eslint/markdownlint toolchain), no patched picomatch version; `npm ls picomatch --omit=dev` is empty",
      "added": "2026-11-17",
      "expires": "2026-12-17",
      "owner": "git-stunts/git-warp#1194"
    }
  ]
}
```

| Field | Rule |
| --- | --- |
| `advisory` | The GHSA identifier from the advisory URL in `npm audit --json`. An advisory whose URL names no GHSA identifier cannot be excepted. |
| `package` | The vulnerable package that the advisory names, not a package that depends on it. |
| `reason` | Why the advisory cannot reach a consumer, and why it cannot be fixed now. It must not be blank. |
| `added` | The UTC day on which the entry was added, as `YYYY-MM-DD`. It cannot be later than the day the gate runs. |
| `expires` | The last UTC day on which the entry applies. It is at most 30 days after `added`. |
| `owner` | The issue or pull request that owns the removal, as `owner/repo#N`. |

The gate is `scripts/dependency-audit/check-locked-audit.ts`. It prints one row for each advisory and for each exception that matches no advisory. It fails (exit 1) when:

- any advisory at or above low is in the published tree, listed or not (`published`);
- a development-only advisory has no exception (`unlisted`);
- an exception was added after today, expires before it was added, or expires more than 30 days after it was added (`invalid-window`);
- today is later than an exception's `expires` day (`expired`);
- the vulnerable package's `latest` version on the registry is outside the advisory's range, so a patched version is published (`patched`); fix the dependency with an update or a reviewed override, and remove the exception;
- an exception matches no advisory at or above low (`stale`).

The gate refuses (exit 2) when `npm audit` or `npm view` cannot give a consistent answer, or when the exception list is not valid: an unknown key, a malformed identifier, package name, date or owner, or two entries for the same advisory and package. A refusal never passes.

Output of a passing run on the lock at `46379ff48`, with the entry above:

```text
audit:locked: audit level low. Published tree (npm audit --omit=dev): advisories 0, vulnerable packages 0. Full tree (npm audit): advisories 1, vulnerable packages 15, locked packages 547. Exceptions in policy/audit-exceptions.json: 1.
RESULT  ADVISORY             PACKAGE    SEVERITY  TREE         DISPOSITION  DETAIL
PASS    GHSA-fc5q-39xc-vjpf  picomatch  high      development  excepted     expires 2026-12-17 (29 days left); owner git-stunts/git-warp#1194; latest picomatch 4.0.7 is inside <=4.0.7; reason: dev-only (vite/vitest/eslint/markdownlint toolchain), no patched picomatch version; `npm ls picomatch --omit=dev` is empty
audit:locked: PASSED: excepted 1, below the audit level 0, failed 0.
```

The table names the vulnerable package only. Run `npm audit` for the dependency paths.

### Add, renew or remove an exception

1. Confirm that the advisory cannot reach a consumer: `npm audit --omit=dev` reports it nowhere, and `npm ls <package> --omit=dev` prints `(empty)`.
2. Confirm that no patched version is published: the version that `npm view <package> version` prints is inside the advisory's range.
3. Name the issue that owns the removal.
4. Add the entry with `added` set to the current UTC day and `expires` at most 30 days later, and have the change reviewed as a gate change.
5. When the fix lands, remove the entry in the same change. The gate fails on a stale entry, so a fixed advisory cannot keep its exception.

A renewal is a new review. Change `added` and `expires` in a pull request that says why the advisory is still unfixed.

### Limits

- The published tree is what `npm audit --omit=dev` audits: production, optional and peer dependencies. A package that is both a production and a development dependency is in the published tree.
- The patched-version check reads only the `latest` dist-tag of the vulnerable package. A fix published only under another dist-tag or on an older major line does not fail the gate. Read the advisory's patched versions when you add or renew an entry.
- The gate does not check that `added` is the day of the commit, or that the `owner` issue exists and is open. Review checks these.
- Expiry uses the UTC day of the machine that runs the gate.
- The gate needs the npm registry. When the registry cannot answer, the gate refuses.
- The release preflight runs the same gate, so a release can ship while a development-only exception is valid. The published tree has no exceptions.

## Lock regeneration

The declared installer remains npm 10. Its optional-peer resolver can fail with `Cannot read properties of null (reading 'edgesOut')` while resolving Vite's development tools. If that occurs, generate the lock with an isolated npm 11.21.1 invocation inside the existing COPY-based Docker worker:

```sh
npm exec --yes --package=npm@11.21.1 -- npm install --package-lock-only --ignore-scripts --no-audit --no-fund
```

This command only generates dependency metadata. Follow it with a clean `npm ci` using the declared npm 10 toolchain, with lifecycle scripts enabled, then the relevant validation and full audit. Do not change the global npm installation, disable peer resolution, or treat successful lock generation as a successful installation. Preserve the optional platform packages in the resulting lock. When upgrading a tightly coupled peer family, the old lock can also make npm report incompatible old and new family members together. Regenerate that family’s stale lock metadata in a disposable copy, retain unrelated resolutions, and let npm resolve the replacement graph. Never hand-author package integrity values or accept unresolved peers; verify the complete result with a normal clean install.

## Reviewed developer-tool overrides

The exact override set is checked by `test/unit/scripts/dependency-hygiene.test.ts`. Unexpected keys or versions fail that check. A newly reviewed security fix must retain caller compatibility evidence and the full audit; the override allowlist records resolutions, not ignored advisories. Advisory exceptions are separate; see [Development-dependency exceptions](#development-dependency-exceptions).

- `markdownlint-cli` uses `js-yaml` 5.4.2 for the existing reviewed YAML correction.
- `markdownlint-cli` uses `smol-toml` 1.9.0. Its current caller requests ~1.7.0, while the [reviewed advisory](https://github.com/advisories/GHSA-r4xh-jqrq-34v2) fixes quadratic key parsing in 1.9.0. Nested values and the actual CLI TOML configuration path have compatibility witnesses.
- KaTeX uses 0.18.2 across the current developer-tool callers. Their 0.16.x requests exclude the [patched trust-setting behavior](https://github.com/advisories/GHSA-238p-pmpm-9mq7). Tests retain ordinary expressions, explicit trusted links, inherited-trust refusal and mathematical SVG rendering through the real Mermaid worker.
- ESLint, its configuration-array reader, the TypeScript parser, and Markdownlint use minimatch 11.0.3. The [pattern-amplification advisory](https://github.com/advisories/GHSA-g3hv-75wg-m249) requires minimatch 11. ESLint 10 removes the older default-export callers that cannot accept that version; typescript-eslint 8.56.1 declares ESLint 10 support. Keep the existing `@eslint/js` 9 recommended-rule baseline until a separate policy change reviews new rules. Development linting requires Node 22.13 or later on the Node 22 line; the published runtime requirement is unchanged.
- The package tracer `@vercel/nft` uses glob 14.0.3 to stop filesystem traversal after an aborted asynchronous walk. Its current glob 13 range excludes the [cancellation fix](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4). `test/unit/scripts/dependency-glob-compatibility.test.ts` exercises the real tracer with dynamically selected assets, ESLint with JavaScript and TypeScript inputs, and Markdownlint with inclusion and exclusion globs. Separate bounded child witnesses cover matcher expansion limits and cancellation during the first directory read.

Source-map-js 1.2.2 is an ordinary lock update within the existing ^1.2.1 caller requests, with no override. It resolves the [indexed-map advisory](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). Isolated child witnesses verify refusal of an excessive section offset and bounded preservation of generated code for an accepted mapping beyond the code's end. Child execution and output have explicit limits.

Remove a security override when the upstream caller admits a compatible patched version and a clean installation, complete audit, and the corresponding compatibility witnesses pass without it. Do not remove a pin solely because a newer caller version exists; verify its dependency range. Preserve platform-specific optional-package constraints during lock generation.

The developer-tool overrides do not change production dependency versions or Git interpretation. The Zod migration separately consumes published `@git-stunts/plumbing` 3.3.3 and `@git-stunts/git-cas` 7.0.0, whose declared dependency ranges admit Zod 4.6.7 without a schema-library override. PR and source-specific results belong in their retained evidence and issue, rather than being inferred from this guide.
