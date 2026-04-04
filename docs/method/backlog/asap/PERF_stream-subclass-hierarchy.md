# Stream subclass hierarchy

**Effort:** M

CborStream, PatchStream, StateStream, FrontierStream, AppliedVVStream,
IndexShardStream — domain stream subclasses carrying semantic identity
and domain-specific behavior.

`instanceof PatchStream` replaces string tag dispatch.
CborEncodeTransform requires CborStream as input.

See cycle 0008 design doc.
