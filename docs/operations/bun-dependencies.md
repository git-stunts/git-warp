# Locked dependencies in the Bun test image

The Bun image uses `package-lock.json` as its dependency authority. A Node22 dependency stage runs `npm ci` with the root manifest, all three workspace manifests, scripts and patches available before installation. The final image copies that installed tree into the existing Bun runtime; it does not invoke Bun's live dependency resolver or migrate a second lockfile. The build stage's Node executable and build tools are not copied into the Bun image.

`npm ci` refuses a missing or incompatible lockfile. Every current workspace manifest is an explicit install-layer input, so changing any of them invalidates that layer. After the source COPY, the Bun-executed dependency graph check compares root/workspace dependency declarations and every reachable installed dependency version against the npm lock. It also requires each workspace link to resolve to its source directory. Adding a workspace requires adding its manifest COPY; the graph check refuses a workspace that only arrived after installation.

The graph comparison follows each dependent's actual resolver. Hoisting a different `js-yaml` version to the root alone is not evidence of drift: `@eslint/eslintrc` and `markdownlint-cli` must resolve their respective locked versions. Optional dependencies may be absent on a platform; any installed optional dependency must match its locked version. A sorted edge fingerprint allows two builds on the same platform to be compared without treating different supported platform packages as equivalent.

Run the normal Bun gate with `npm run test:bun`. For a clean-cache witness, build the checkout twice with separate tags, then run the image's unchanged API suite and dependency check in both:

```sh
docker build --no-cache -f docker/Dockerfile.bun -t git-warp-bun:first .
docker build --no-cache -f docker/Dockerfile.bun -t git-warp-bun:second .
docker run --rm --init --cpus=2 --memory=2g git-warp-bun:first \
  bun scripts/CheckBunLockedDependencyGraph.mjs
docker run --rm --init --cpus=2 --memory=2g git-warp-bun:second \
  bun scripts/CheckBunLockedDependencyGraph.mjs
docker run --rm --init --cpus=2 --memory=2g git-warp-bun:first
docker run --rm --init --cpus=2 --memory=2g git-warp-bun:second
```

Both stages target the same Docker architecture. Native optional packages remain subject to Bun's supported ABI and the target image's libc; the API integration suite exercises the existing WASM bitmap fallback. A successful build on one platform is not a claim of execution on another. Node and Deno test images and their runtime checks remain separate.
