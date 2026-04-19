# OWNERSHIP

One owner per behavior.

## Invariant

Behavior has a clear home. No god objects, mixed-concern facades,
shadow implementations, duplication corridors, or policy drift through
copy-paste.

## Use this when

- a file or service owns too many concerns
- behavior is duplicated across helpers or facades
- public APIs and internal helpers drift apart
- dead branches and boilerplate exist because ownership is muddled

## Not this

- Domain-vs-host boundary problems are `HEX`
- missing runtime classes are `MODEL`
- tests/docs/mocks lying about the contract are `SPEC`

## Legend code

`OWN`
