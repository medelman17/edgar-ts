---
"edgar-ts": minor
---

Add custom `fetch` function injection to `EdgarClientOptions`.

**New option:** `fetch?: FetchFn` — allows consumers to provide a custom fetch implementation for proxy routing, testing, or custom transport. Falls back to `globalThis.fetch` when not provided.

**New type:** `FetchFn` — a minimal fetch-compatible function signature that avoids DOM type dependencies (safe for `lib: ["ES2022"]` without DOM).

All existing behavior (rate limiting, retry, timeout, telemetry) wraps whatever fetch function is supplied. Non-breaking — existing consumers see no difference.
