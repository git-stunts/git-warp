# _wiredMethods.d.ts is 708 lines of hand-maintained type lies

## Smell

`src/domain/warp/_wiredMethods.d.ts` hand-declares ~100 methods that
are monkey-patched onto WarpRuntime via `defineProperty` loops. Every
time someone adds a method to a controller, they must manually update
this file. It drifts constantly. The types say one thing; the runtime
does another.

## Files

- `src/domain/warp/_wiredMethods.d.ts` (708 LOC)

## Fix

Dies when WarpRuntime dies. The capability interfaces ARE the type
declarations — auto-checked by `tsc`, not hand-maintained.
