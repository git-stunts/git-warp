# CC_codec-module-untested

**Title:** 5 codec modules have zero test files (732 LOC)
**Effort:** M

## Issue

AnchorMessageCodec.js (84 LOC), CheckpointMessageCodec.js (140 LOC),
MessageCodecInternal.js (148 LOC), MessageSchemaDetector.js (180 LOC),
PatchMessageCodec.js (137 LOC), TrailerValidation.js (74 LOC) — all
have zero dedicated test files. These are critical boundary modules that
handle wire format parsing. Bugs here corrupt data silently.

## Fix

Create unit tests for each codec module. Priority: PatchMessageCodec
and CheckpointMessageCodec (most critical paths). Test roundtrip
encoding/decoding, malformed input rejection, schema version detection.
