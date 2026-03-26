---
"edgar-ts": minor
---

Add custom `fetch` function injection to `EdgarClientOptions` and broaden response/init types.

**New option:** `fetch?: FetchFn` — allows consumers to provide a custom fetch implementation for proxy routing, testing, or custom transport. Falls back to `globalThis.fetch` when not provided.

**New types:**
- `FetchResponse` — response type including `json()`, `text()`, `arrayBuffer()`, and `headers` (the methods consumers actually use)
- `FetchInit` — request init type with `method`, `headers`, `body`, `signal`, and index signature
- `FetchFn` — updated to use `FetchInit` and `FetchResponse` instead of narrow `Record<string, unknown>` / `{ ok, status }`

**Type cleanup:** Removed 6 `as unknown as` response casts across consumer files (`fetch-json.ts`, `download/service.ts`, `exhibits/service.ts`, `discovery/pagination.ts`, `discovery/index-service.ts`, `bulk/service.ts`). The broadened `FetchResponse` type makes these casts unnecessary.

All existing behavior (rate limiting, retry, timeout, telemetry) wraps whatever fetch function is supplied. Non-breaking — existing consumers see no difference.
