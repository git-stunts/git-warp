# Cone showcase witness: before-17084f178

| Metric | 200 threads | 2,000 threads | 20,000 threads |
| --- | --- | --- | --- |
| Run status | complete | complete | complete |
| Bulk load, batched (patches; total ms) | 15; 410 | 123; 3695 | 1203; 35944 |
| Repo after load (MiB) | 1 | 4 | 39 |
| Save, one patch, ms (p50 / p95) | 21.23 / 24.69 | 29.45 / 35.5 | 25.96 / 28.72 |
| Git processes per save (p50 / p95) | 26 / 26 | 26 / 26 | 26 / 26 |
| Save outcomes | derived 60 | derived 60 | derived 60 |
| One document's margins, ms (p50 / p95) | 1.15 / 1.7 | 1.44 / 2.14 | 1.63 / 2.34 |
| Git processes per margins read (p50 / p95) | 2 / 2 | 2 / 2 | 2 / 2 |
| Margins outcomes | obstructed 30; mismatches among completed 0 | obstructed 30; mismatches among completed 0 | obstructed 30; mismatches among completed 0 |
| Cold open to first margins, ms (p50 / p95) | 181 / 184 | 181 / 186 | 203 / 214 |
| Git processes, cold open (p50 / p95) | 14 / 14 | 14 / 14 | 14 / 14 |
| Cold open outcomes | obstructed, obstructed, obstructed, obstructed, obstructed | obstructed, obstructed, obstructed, obstructed, obstructed | obstructed, obstructed, obstructed, obstructed, obstructed |
| Max RSS, witness process (MiB) | 163 | 220 | 298 |
| Max RSS, cold open process (MiB, p50 / p95) | 129 / 130 | 127 / 129 | 128 / 130 |

## Obstructions and errors

- 200 threads, margins: documentThreads: missing_bounded_basis (30)
- 200 threads, cold open: documentThreads: missing_bounded_basis
- 2000 threads, margins: documentThreads: missing_bounded_basis (30)
- 2000 threads, cold open: documentThreads: missing_bounded_basis
- 20000 threads, margins: documentThreads: missing_bounded_basis (30)
- 20000 threads, cold open: documentThreads: missing_bounded_basis
