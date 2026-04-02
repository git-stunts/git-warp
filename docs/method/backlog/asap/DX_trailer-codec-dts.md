# `@git-stunts/trailer-codec` Type Declarations

**Effort:** M

## Problem

`getCodec()` in `MessageCodecInternal.js` returns an untyped `TrailerCodec`, forcing 6+ downstream files to cast through `unknown` intermediary. Root fix: add `index.d.ts` to the `@git-stunts/trailer-codec` package upstream.

## Notes

- Source: P1b priority tier (TSC Zero Campaign Drift Audit)
- Fix is upstream in `@git-stunts/trailer-codec`, not in this repo
