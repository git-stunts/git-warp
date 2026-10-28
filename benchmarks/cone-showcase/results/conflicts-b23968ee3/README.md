# Cone showcase witness with conflict visibility

These results come from `feat/cone-bounded-runtime` at `b23968ee3`: the
integrated goalpost plus the cone entity admission index (`a2d11717d`) and
conflict visibility (slice 6, `bdcfef932` with the read-path follow-ups
`f43587613` and `b23968ee3`). The run used the `docker/Dockerfile.node22-slim`
image, limited to 4 CPUs and 6 GiB with a 4 GiB generated-data budget, through
`npm run witness:cone-showcase -- 2000 --label conflicts-b23968ee3`.

- `example-output.txt` and `example.exit`: the annotations example exited 0.
- `cone-showcase-2000.json`, `summary.json` and `summary.md`: the 2,000 thread
  scale completed; every save derived and every margins read completed with no
  mismatch.
- `same-day-baseline-f161bfe0d.md` and `same-day-change1-7785ebb70.md`: the
  same witness (`--no-example 2000`) rerun the same day, under the same lock and
  limits, on the integrated baseline (`f161bfe0d`, whose code is that of
  `integrated-0504d5d64`) and on the admission index alone (`7785ebb70`), so the
  comparison does not mix machine conditions.

| 2,000 threads | Baseline f161bfe0d | Admission index 7785ebb70 | Conflicts b23968ee3 |
| --- | --- | --- | --- |
| Save, ms (p50 / p95) | 47.88 / 56.17 | 48.09 / 54.33 | 48.28 / 54.03 |
| Git processes per save | 30 | 30 | 28 |
| Margins read, ms (p50 / p95) | 38.58 / 48.72 | 39.27 / 52.72 | 42.98 / 50.25 |
| Git processes per margins read | 8 | 8 | 8 |
| Cold open, ms (p50) | 282 | 285 | 294 |

Saves cost the same time and two fewer Git processes; a property-setting save
now takes its observed heads from the cone basis it advances instead of listing
writer refs, which is the likely reason (not profiled separately). Margins reads start the same 8 processes but take about 4 ms more
at p50 (p95 is within the baselines' spread). Earlier builds of slice 6 measured
44.76 ms (`bdcfef932`, twice) and 43.68 ms (`f43587613`); keeping sibling sets
undecoded behind a hint brought it to 42.98 ms. The remainder was not
attributed further; the records a margins read decodes are larger.
