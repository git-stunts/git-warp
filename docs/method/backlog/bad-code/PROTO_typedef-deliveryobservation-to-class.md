# Promote DeliveryObservation from @typedef to class

**Effort:** XS

## Problem

`src/domain/types/DeliveryObservation.js` defines `DeliveryObservation`
as a `@typedef {Object}` with a factory (`createDeliveryObservation`)
returning a frozen object. Should be a class.
