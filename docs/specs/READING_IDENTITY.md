# Reading Identity

Reading identity separates the bytes retained by git-warp from the semantic
question those bytes answer.

The rule is:

```text
A byte hash identifies bytes.
A reading identity identifies a question over witnessed causal history.
```

Git object IDs, CAS hashes, retained payload hashes, commitment roots, proof
references, basis identities, and semantic reading identities must not be used
as substitutes for one another.

## Identity Stack

| Identity | Meaning | Invalid shortcut |
| --- | --- | --- |
| Git object ID | Exact Git object bytes. | Treating a tree or blob SHA as the answer to a read. |
| CAS hash | Exact retained content bytes. | Treating content identity as semantic truth. |
| Retained payload hash | Canonical bytes for a retained reading or checkpoint payload. | Treating payload bytes as the whole reading contract. |
| Commitment root | Authenticated commitment to retained coordinates, when present. | Treating a commitment as opened support. |
| Proof reference | Compact support for selected openings, when present. | Treating a proof as admission authority without policy checks. |
| Basis identity | Causal frontier, checkpoint, shard family, and tail range used for a reading. | Treating a basis as a particular user question. |
| Semantic reading identity | Question, basis, aperture, law, projection, rights, budget, and evidence posture. | Treating any byte hash as the semantic read key. |

## Reading Shape

A semantic reading identity names:

- graph or worldline name;
- coordinate or checkpoint basis;
- frontier and tail range;
- optic law or projection identity;
- observer aperture;
- query variables or selector values;
- codec or payload layout family;
- support obligations;
- rights posture;
- budget posture;
- evidence posture;
- residual, redaction, plurality, or obstruction posture.

If any of those fields affect the answer, they are part of the semantic
identity. They cannot be omitted merely because a retained payload hash exists.

## Manifest Consequences

Checkpoint basis manifests and slice outputs must keep these fields separate:

- basis identity;
- semantic reading identity;
- retained payload refs;
- retained payload byte hashes;
- optional commitment family and root;
- optional proof family and refs;
- opened coordinate or aperture-selector metadata;
- verification posture;
- residual or obstruction posture.

Using a Git/CAS hash as a semantic reading identity is a correctness bug. It
loses the question, aperture, law, budget, and evidence posture that make the
bytes meaningful.

## Adapter Consequences

Adapters, generated helpers, CLI commands, and operator tools may cache retained
payload bytes. Their cache key must include semantic reading identity plus byte
identity. A cache hit on bytes is not enough to prove the current question was
answered.

Missing support is not a cache miss to paper over. It is one of:

- obstruction;
- residual posture;
- redaction;
- plurality;
- rehydration requirement;
- explicit diagnostic/global job requirement.

## Release Evidence

Release evidence that claims a retained reading or checkpoint proof must name:

- the canonical fixture or immutable input;
- the replay command;
- the witness;
- the expected deterministic result;
- the relevant byte identities;
- the semantic reading identity or goalpost proof matrix row.
