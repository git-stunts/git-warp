# Curated results

These files are the benchmark evidence cited by
[`docs/topics/git-perf.md`](../../../docs/topics/git-perf.md). Exploratory,
superseded, and failed harness runs are intentionally excluded.

The profiles were recorded on an Apple M1 Pro using Node 24.12.0 and Apple Git
2.50.1. The Markdown files are the human-readable reports. The matching JSON
files retain machine-readable measurements and scenario settings.

## Backend and operation profiles

- `2026-07-19T06-17-15-818Z`: complete loose and packed microbenchmark matrix.
- `2026-07-19T06-06-10-981Z-resources`: Git pack-mapping limit matrix.
- `2026-07-19T06-06-33-852Z-resources`: bounded and unbounded persistent Git
  page reads.
- `2026-07-19T06-06-53-334Z-resources`: NodeGit page reads.
- `2026-07-19T06-07-10-515Z-resources`: all page-write backends.
- `2026-07-19T06-16-26-166Z-resources`: 1 MiB buffered read window.
- `2026-07-19T06-12-26-522Z-resources`: 256 KiB buffered read window.
- `2026-07-19T06-12-39-848Z-resources`: 64 KiB buffered read window.
- `2026-07-19T06-12-52-837Z-resources`: 1 GiB bounded-memory page scan.
- `2026-07-19T06-13-49-188Z-resources`: random 256 KiB git-cas-sized chunks.
- `2026-07-19T06-15-46-212Z-resources`: uncompressed page write.
- `2026-07-19T06-16-04-863Z-resources`: compressible 256 KiB chunks.

## Semantic profile

- `2026-07-19T06-56-00-883Z-semantics`: process and fixture lifecycle,
  concurrency, maintenance, ref transaction, SHA-256, alternate object
  database, and packed-ref probes.

Run the commands in the [spike README](../README.md) to generate a fresh result
set. Treat these local numbers as architectural evidence, not portable absolute
performance thresholds; CI must calibrate gates on its own runner class.
