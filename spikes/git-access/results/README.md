# Curated results

These files are the benchmark evidence cited by
[`docs/topics/git-perf.md`](../../../docs/topics/git-perf.md). Exploratory,
superseded, and failed harness runs are intentionally excluded.

The profiles were recorded on an Apple M1 Pro using Node 24.12.0 and Apple Git
2.50.1. The Markdown files are the human-readable reports. The matching JSON
files retain machine-readable measurements and scenario settings.

## Backend and operation profiles

- `2026-07-19T02-48-22-302Z`: complete loose and packed microbenchmark matrix.
- `2026-07-19T03-16-53-714Z-resources`: Git pack-mapping limit matrix.
- `2026-07-19T03-21-34-452Z-resources`: bounded and unbounded persistent Git
  page reads.
- `2026-07-19T03-22-12-932Z-resources`: NodeGit page reads.
- `2026-07-19T03-23-45-986Z-resources`: all page-write backends.
- `2026-07-19T04-19-11-681Z-resources`: 1 MiB buffered read window.
- `2026-07-19T03-41-40-312Z-resources`: 256 KiB buffered read window.
- `2026-07-19T03-42-12-121Z-resources`: 64 KiB buffered read window.
- `2026-07-19T03-45-11-827Z-resources`: 1 GiB bounded-memory page scan.
- `2026-07-19T03-49-08-410Z-resources`: random 256 KiB git-cas-sized chunks.
- `2026-07-19T03-51-58-303Z-resources`: uncompressed page write.
- `2026-07-19T03-53-01-288Z-resources`: compressible 256 KiB chunks.

## Semantic profile

- `2026-07-19T03-57-18-655Z-semantics`: lifecycle, concurrency, maintenance,
  ref transaction, SHA-256, alternate object database, and packed-ref probes.

Run the commands in the [spike README](../README.md) to generate a fresh result
set. Treat these local numbers as architectural evidence, not portable absolute
performance thresholds; CI must calibrate gates on its own runner class.
