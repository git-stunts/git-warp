# Cone showcase witness: after-e36380add

| Metric | 200 threads | 2,000 threads | 20,000 threads |
| --- | --- | --- | --- |
| Run status | complete | complete | aborted (WitnessBudgetExceeded: generated data reached 4390014976 bytes, over the 4294967296-byte budget) |
| Bulk load, batched (patches; total ms) | 15; 9095 | 123; 104509 | n/m |
| Repo after load (MiB) | 41 | 401 | n/m |
| Save, one patch, ms (p50 / p95) | 55.49 / 68.75 | 60.14 / 74.4 | n/m |
| Git processes per save (p50 / p95) | 67 / 83 | 67 / 83 | n/m |
| Save outcomes | derived 60 | derived 60 | n/m |
| One document's margins, ms (p50 / p95) | 288.69 / 311.29 | 287.26 / 311.69 | n/m |
| Git processes per margins read (p50 / p95) | 384 / 417 | 370 / 377 | n/m |
| Margins outcomes | completed 30; mismatches among completed 0 | completed 30; mismatches among completed 0 | n/m |
| Cold open to first margins, ms (p50 / p95) | 516 / 540 | 518 / 550 | n/m |
| Git processes, cold open (p50 / p95) | 416 / 429 | 382 / 402 | n/m |
| Cold open outcomes | completed, completed, completed, completed, completed | completed, completed, completed, completed, completed | n/m |
| Max RSS, witness process (MiB) | 226 | 226 | 326 |
| Max RSS, cold open process (MiB, p50 / p95) | 140 / 142 | 142 / 142 | n/m |

## Obstructions and errors

None.
