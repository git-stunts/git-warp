# Promote EffectEmission from @typedef to class

**Effort:** XS

## Problem

`src/domain/types/EffectEmission.js` defines `EffectEmission` as a
`@typedef {Object}` but has a factory (`createEffectEmission`) that
returns a frozen object. Should be a class. `EffectCoordinate` could
merge into it as a nested shape or separate class.
