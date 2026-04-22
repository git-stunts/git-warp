---
id: PROTO_typed-codec-port-pattern
blocked_by: []
blocks: []
---

# Typed codec port pattern — domain never touches raw bytes for serde

The ShardPort pattern (domain works with typed shard objects, port
adapter owns Uint8Array ↔ object conversion) generalizes to ALL ports.

Instead of ports returning `Uint8Array` and the domain decoding:

```typescript
// Current — domain does serde
const raw: Uint8Array = await port.read(key);
const decoded = codec.decode(raw);  // domain is doing serde
```

Every port returns typed domain objects directly:

```typescript
// Clean — port adapter owns serde
const shard: MetaShard = await shardPort.loadMeta(key);
// MetaShard is a typed domain object. Port decoded it.
```

This is SSTS P5 ("serialization is the codec's problem") taken to
its logical conclusion. The domain layer never imports a codec. Never
calls encode/decode. Never touches `Uint8Array` for serde purposes.
Bytes enter and leave through port adapters.

The domain can still work with `Uint8Array` when bytes ARE the domain
value (content blobs, binary attachments). The distinction: domain
bytes are content; adapter bytes are encoding.
