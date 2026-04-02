# EffectSinkPort Breaking Change Hygiene

**Effort:** S

## Problem

`EffectSinkPort.deliver()` return type was widened from `DeliveryObservation` to `DeliveryObservation | DeliveryObservation[]` in `index.d.ts`. This is a breaking API surface change that shipped without a `BREAKING CHANGE` commit footer. Assess downstream impact and decide: (a) revert the widening and fix MultiplexSink to unwrap, or (b) accept it and document as a breaking change for the next major version.

## Notes

- Source: P1b priority tier (TSC Zero Campaign Drift Audit)
- High priority
