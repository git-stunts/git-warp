# PORT

Capabilities must tell the runtime truth.

## Invariant

Ports and public capability surfaces expose the real contract. No
side-channel adapter reach-through, no missing capability surface, no
dishonest encapsulation.

## Use this when

- a capability exists in the adapter but not in the port
- callers reach through public internals because the port is wrong
- a public surface leaks implementation details or hides needed ones
- composition depends on broken `instanceof` or structural accidents

## Not this

- Infrastructure in domain is `HEX`
- Runtime type lies are `CAST`
- mixed-concern or god-object ownership problems are `OWN`

## Legend code

`PORT`
