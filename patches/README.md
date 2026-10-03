# Dependency declarations

This directory retains the reviewed declaration payload installed by
`scripts/TrailerCodecDeclarationInstaller.ts` during `npm ci`/`npm install`.
Installation runs before the existing Git hook setup. Generic patch tooling is
unnecessary for this declaration-only boundary and is no longer a dependency.

## Rationale

### `@git-stunts/trailer-codec@2.1.1`

- **Issue:** The package ships JavaScript without bundled TypeScript
  declarations.
- **Impact:** git-warp would otherwise need ambient declarations in its own
  source tree, making dependency runtime drift harder to notice.
- **Why package-local declarations?** Keeping declarations beside the dependency gives the
  TypeScript compiler a package-local contract while preserving the runtime
  dependency.
- **Installation:** The installer accepts only the exact package name/version
  and reviewed declaration SHA-256. It creates a missing `index.d.ts`
  exclusively, accepts identical repeated installation without rewriting, and
  refuses conflicting files or changed declaration sources. Unsupported
  versions fail preparation rather than receiving unchecked declarations.
  Dependency JavaScript and package metadata remain untouched.
  Missing/malformed package metadata or filesystem failures also fail
  preparation through their original exceptions; they are not reported as
  successful installation or structured content refusals.
- **Status:** Required until upstream publishes equivalent package
  declarations.
