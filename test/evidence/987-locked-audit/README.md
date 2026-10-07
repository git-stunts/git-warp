# #987 locked-audit baseline

Issue: [#987](https://github.com/git-stunts/git-warp/issues/987). Mainline base and exact input commit: `ceb58e656ec5bc85f0ae5991bf2a55599693bbb3`, verified origin/main and v20.0.0. There is no dependency correction or GREEN claim in this commit.

The guarded COPY-based Node 22.23.3/npm 10.9.9 run `red-audit-987-v1` reproduces a full audit exit of 1. Its JSON reports ten findings: seven low, two moderate, one high. Root packages are katex 0.16.47, smol-toml 1.7.1 and source-map-js 1.2.1; findings include propagated dependency records. No deployed exploit or affected user count is established.

The same run verifies that patched packages are published: katex 0.18.2, smol-toml 1.9.0, source-map-js 1.2.2. Version and distribution-integrity metadata are preserved in the console. Publication alone does not establish caller compatibility. KaTeX's 0.18 line is outside current 0.16.x requests; markdownlint-cli requests smol-toml ~1.7.0. source-map-js 1.2.2 fits its callers' ^1.2.1 requests. Primary advisories are linked from the issue.

The unchanged gate remains npm audit --audit-level=low. Development dependencies must remain included. Preserve supported Markdown/TOML parsing, mathematical rendering, real Mermaid rendering and existing runtime contracts while restoring the full gate. Do not apply a blind forced audit fix or adopt a downgrade merely because npm proposes it.

The reusable git-warp-tests worker/image/build volume and existing Node22 toolchain are used under workstation.git admission for host/heavy-work and host/docker/git-warp-tests/. No host repository or Git mounts exist. CPU quota/affinity is four cores, memory-plus-swap ceiling 8 GiB, task limit 768 with monitored headroom, build ceiling 20 GiB monitored, data tmpfs quota 3 GiB within the 4 GiB project allocation, and project log limit 128 MiB. Inner/outer deadlines are 1700/1750 seconds; child cleanup and container stop precede lease release. The guard reported no refusal, PID or OOM event in this baseline run. Exact values and source/image/command identity are in the receipts. Compressed output preserves all remaining bytes, with public container-home normalization recorded separately from original hashes.

Remaining: select and verify a compatible lock correction, record GREEN and meaningful tooling compatibility, complete current-head review and required CI, integrate this prerequisite, then update PR #986 without bypassing its audit gate.
