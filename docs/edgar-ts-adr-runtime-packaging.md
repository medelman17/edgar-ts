# ADR-001: Runtime and Packaging

**Date:** 2026-02-15  
**Status:** Accepted

## Context
`edgar-ts` must be easy to adopt by TS-first backend teams while avoiding runtime fragmentation in v1.

## Decision
1. Support Node and Bun in v1.
2. Ship as an npm package with MIT license.
3. Expose high-level client API as the default entrypoint.
4. Keep browser support out of scope for v1.

## Rationale
1. Node+Bun covers immediate target consumers with manageable compatibility surface.
2. High-level API minimizes onboarding time.
3. Browser support would expand complexity without current business value.

## Consequences
1. CI requires dual-runtime matrix.
2. Runtime-agnostic API patterns are preferred.
3. Future Deno/browser support can be considered as additive roadmap items.

## Rejected Alternatives
1. Node-only: rejected because Bun support is explicitly required.
2. Node+Bun+Deno in v1: rejected due to higher maintenance cost.
3. Low-level endpoint-only API: rejected due to integration burden.
