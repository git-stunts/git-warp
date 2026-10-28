# Cone showcase witness: integrated-0504d5d64

| Metric | 200 threads | 2,000 threads | 20,000 threads |
| --- | --- | --- | --- |
| Run status | complete | complete | complete |
| Bulk load, batched (patches; total ms) | 15; 1015 | 123; 12915 | 1203; 245085 |
| Repo after load (MiB) | 3 | 46 | 575 |
| Save, one patch, ms (p50 / p95) | 32.95 / 38.95 | 45.95 / 52.45 | 168.26 / 183.63 |
| Git processes per save (p50 / p95) | 30 / 30 | 30 / 30 | 30 / 30 |
| Save outcomes | derived 60 | derived 60 | derived 60 |
| One document's margins, ms (p50 / p95) | 31.51 / 41.24 | 36.29 / 45.65 | 65.42 / 77.52 |
| Git processes per margins read (p50 / p95) | 8 / 8 | 8 / 8 | 8 / 8 |
| Margins outcomes | completed 30; mismatches among completed 0 | completed 30; mismatches among completed 0 | completed 30; mismatches among completed 0 |
| Cold open to first margins, ms (p50 / p95) | 270 / 275 | 282 / 293 | 314 / 335 |
| Git processes, cold open (p50 / p95) | 20 / 20 | 20 / 20 | 20 / 20 |
| Cold open outcomes | completed, completed, completed, completed, completed | completed, completed, completed, completed, completed | completed, completed, completed, completed, completed |
| Max RSS, witness process (MiB) | 230 | 331 | 407 |
| Max RSS, cold open process (MiB, p50 / p95) | 142 / 143 | 142 / 143 | 143 / 143 |

## Obstructions and errors

None.
