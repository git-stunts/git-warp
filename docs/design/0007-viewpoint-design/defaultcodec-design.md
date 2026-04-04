# defaultCodec → infrastructure: Design

## Problem

`src/domain/utils/defaultCodec.js` imports `cbor-x` directly — a
concrete codec dependency inside the domain layer. This violates P5
("Serialization Is the Codec's Problem") and the hexagonal boundary
(domain must not import infrastructure concerns).

24 domain files import `defaultCodec` as a fallback:
`const c = codec || defaultCodec;`

This is wrong. The domain should speak only through the `CodecPort`
interface. If a service needs a codec, it receives one via
constructor injection. The decision of WHICH codec to use belongs
at the composition root, not scattered across 24 files.

## Design

**Move the implementation. Kill the import. Inject at the root.**

### Step 1: Move defaultCodec to infrastructure

`git mv src/domain/utils/defaultCodec.js` →
`src/infrastructure/codecs/DefaultCodecAdapter.js`

Update module JSDoc. No re-export shim — the old path dies.

### Step 2: Inject codec from the composition root

`WarpRuntime` already accepts a `codec` option and defaults to
`defaultCodec` if not provided. This is the composition root.
Every service that currently does `codec || defaultCodec` should
instead receive the codec from its caller (ultimately from
WarpRuntime).

For each of the 24 domain files:
- Remove `import defaultCodec from '...'`
- Change `codec || defaultCodec` → just `codec`
- If the service can receive a null codec, make it a required
  constructor param or propagate from the caller

### Step 3: Update WarpRuntime to provide the default

`WarpRuntime.open()` already defaults:
```javascript
this._codec = codec || defaultCodec;
```

Change this to:
```javascript
import DefaultCodecAdapter from '../infrastructure/codecs/DefaultCodecAdapter.js';
this._codec = codec || DefaultCodecAdapter;
```

WarpRuntime is at the domain/infrastructure boundary — it's allowed
to import infrastructure (it already imports GitGraphAdapter, etc.).

### Step 4: Update bin/ and test/ files

These are outside domain — they import directly from infrastructure:
```javascript
import DefaultCodecAdapter from '.../infrastructure/codecs/DefaultCodecAdapter.js';
```

## Why not a shim?

A re-export shim in `domain/utils/defaultCodec.js` would let the 24
domain files keep their import. But that's leaving the smell in place
with a coat of paint. The whole point of P5 is that domain services
should not know what codec they're using. A shim still makes them
reach for a specific codec — it just hides the reach behind one
level of indirection.

The proper fix is injection. The churn is mechanical and the result
is a clean hexagonal boundary.

## Breaking changes

None externally. The codec injection is internal wiring. Public API
unchanged.
