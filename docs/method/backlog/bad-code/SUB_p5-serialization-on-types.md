# Domain types own their own serialization (P5 violation)

**Effort:** S

## What's Wrong

`canonicalJson()` lives directly on `TickReceipt`, `EffectEmission`,
and `DeliveryObservation`. `ORSet` has `serialize()`/`deserialize()`.

P5: "Serialization is the codec's problem. Domain types do not know
how they are encoded." These methods couple domain types to a specific
encoding format and make it impossible to swap codecs.

## Suggested Fix

Move serialization to codec modules in `src/infrastructure/codecs/`.
Domain types expose their data via accessors; codecs own the encoding.
