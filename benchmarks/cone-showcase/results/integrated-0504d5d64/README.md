# Cone showcase witness on the integrated goalpost branch

These results come from `feat/cone-bounded-runtime` at `0504d5d64`: slices 1 to 4
(cone records, public reads and writes, fork, strands and settlement on cone
bases) merged with cone storage layout 2 (`feat/1039-cone-storage-perf`) and the
showcase (`feat/1039-cone-showcase`). Each run used the
`docker/Dockerfile.node22-slim` image, limited to 4 CPUs and 6 GiB with a 4 GiB
generated-data budget. The 200 and 2,000 thread scales and the example ran in
one invocation of `npm run witness:cone-showcase -- --label integrated-0504d5d64 200 2000`;
the 20,000 thread scale ran in a second invocation with `--no-example 20000`, so
that each command stayed under 45 minutes. `summary.md` and `summary.json` were
regenerated over all three result files with `WitnessReport.ts`.

- `example-output.txt` and `example.exit`: the annotations example exited 0.
  Every write derived and every Observation completed, with no repair step.
- `cone-showcase-<N>.json` and `summary.md`: every scale completed. Saves cost 30
  Git processes and margins reads 8 at every scale; a cold open costs 20. The
  20,000 thread save is slower (p50 168 ms) because the bulk load leaves one pack
  per batched fold (1,203 packs); see git-warp #1041.
