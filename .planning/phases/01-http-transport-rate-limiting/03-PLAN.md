---
phase: 01-http-transport-rate-limiting
plan: 03
type: execute
wave: 3
depends_on: ["01-http-transport-rate-limiting/01", "01-http-transport-rate-limiting/02"]
files_modified:
  - src/http/client.ts
  - src/http/index.ts
  - tests/http/client.test.ts
autonomous: false

must_haves:
  truths:
    - "SecHttpClient enforces mandatory user-agent header on all requests"
    - "Requests are rate-limited: 100+ concurrent requests total ≥ 100/(configured rate) seconds"
    - "Retryable errors (429, 503) automatically retry with exponential backoff; non-retryable errors fail immediately"
    - "Request timeout (default 10s) enforces AbortSignal and surfaces TimeoutError"
    - "Telemetry hooks (onRequestStart, onRequestEnd, onRetry) fire with structured event data"
    - "Response.ok check applied; non-2xx responses classified and either retried or thrown"
  artifacts:
    - path: "src/http/client.ts"
      provides: "SecHttpClient class orchestrating limiter, timeout, retry, error mapper, telemetry"
      exports: ["SecHttpClient"]
      min_lines: 150
    - path: "src/http/index.ts"
      provides: "Barrel export of all HTTP module items (TokenBucket, RetryPolicy, SecHttpClient, etc.)"
      exports: ["TokenBucket", "SecHttpClient"]
      min_lines: 10
    - path: "tests/http/client.test.ts"
      provides: "Integration tests: rate limiting under load, retry with jitter, timeout, user abort, telemetry events"
      min_lines: 200
  key_links:
    - from: "src/http/client.ts"
      to: "SecHttpClient.request()"
      via: "Acquire rate limiter token → timeout wrapper → fetch → error classification → retry loop"
      pattern: "limiter\\.acquire|fetchWithTimeoutAndAbort|classifyResponseError|calculateBackoffMs"
    - from: "src/http/client.ts"
      to: "Telemetry hooks"
      via: "Fire onRequestStart before fetch, onRequestEnd after, onRetry before backoff delay"
      pattern: "telemetry\\?\\.(onRequestStart|onRequestEnd|onRetry)"
    - from: "tests/http/client.test.ts"
      to: "src/http/client.ts"
      via: "Verify rate limiting + retry under load: 100+ concurrent requests, mock responses"
      pattern: "Promise\\.all.*acquire|429|503|fake.*timer"
    - from: "tests/http/client.test.ts"
      to: "Telemetry"
      via: "Capture telemetry events, verify they fire in correct sequence"
      pattern: "onRequestStart.*onRetry.*onRequestEnd|telemetry\\.events"
---

<objective>
Build SecHttpClient orchestrator combining all five concerns (rate limiting, timeout, retry, error classification, telemetry).

Purpose: Implement the main HTTP client that all downstream modules depend on. SecHttpClient composes limiter, timeout wrapper, retry policy, and error mapper into a single request() method. Unit tests verify correct sequencing under load.

Output: `SecHttpClient` class with comprehensive integration tests proving:
- Rate limiting enforced (100+ concurrent requests respect cap)
- Retry logic driven by error.retryable flags (not arbitrary status codes)
- Timeout enforced; user signals respected
- Telemetry events fired in correct sequence
- User-agent validation on construction
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-http-transport-rate-limiting/01-RESEARCH.md
@.planning/phases/01-http-transport-rate-limiting/01-01-SUMMARY.md
@.planning/phases/01-http-transport-rate-limiting/01-02-SUMMARY.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@src/types/index.ts
@src/errors/index.ts
@src/client.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement SecHttpClient orchestrator (src/http/client.ts)</name>
  <files>src/http/client.ts</files>
  <action>
Create SecHttpClient class that orchestrates all five concerns (limiter, timeout, retry, error mapper, telemetry):

**Class:** SecHttpClient
**Constructor:** SecHttpClientOptions (extend from EdgarClientOptions or create new type)
- userAgent: string (required, non-empty) — validated same as EdgarClient
  - Throw ConfigurationError if empty or whitespace-only
- maxRequestsPerSecond: number (default 8, range 1-10)
- timeoutMs: number (default 10_000)
- retries: RetryOptions (default { maxAttempts: 3, baseDelayMs: 250, maxDelayMs: 4_000 })
- telemetry?: TelemetryOptions (optional)

**Field initialization:**
- Create TokenBucket(maxRequestsPerSecond) as this.limiter
- Store timeoutMs, retries, telemetry, userAgent as readonly fields

**Method:** request(url: string, init?: RequestInit & { signal?: AbortSignal }): Promise<Response>
- Implements full retry loop orchestrating all concerns
- Returns response object (caller responsible for response.ok check and body parsing)

**Implementation pseudocode:**

```
async request(url: string, init?: RequestInit & { signal?: AbortSignal }):
  1. Validate userAgent header
     - If init?.headers doesn't include User-Agent, add one
     - Set init.headers["User-Agent"] = this.userAgent

  2. Initialize retry loop:
     - attempt = 0
     - while attempt < this.retries.maxAttempts:

  3. Acquire rate limiter token:
     - await this.limiter.acquire(1)

  4. Fire telemetry: onRequestStart
     - this.telemetry?.onRequestStart?.({
         url,
         method: init?.method ?? "GET",
         timestamp: Date.now(),
       })

  5. Measure time and fetch with timeout:
     - startTime = Date.now()
     - response = await fetchWithTimeoutAndAbort(
         url,
         this.timeoutMs,
         init?.signal
       )
     - durationMs = Date.now() - startTime

  6. Fire telemetry: onRequestEnd
     - this.telemetry?.onRequestEnd?.({
         url,
         method: init?.method ?? "GET",
         statusCode: response.status,
         durationMs,
         timestamp: Date.now(),
       })

  7. Check response.ok:
     - if (!response.ok):
       - error = classifyResponseError(response.status, url)
       - if (!error.retryable || attempt === maxAttempts - 1):
         - throw error
       - else:
         - Calculate backoff delay
         - Fire telemetry: onRetry
         - await new Promise(resolve => setTimeout(resolve, backoffMs))
         - attempt++
         - continue loop

  8. Return response on success
     - return response

9. Exception handling (network error, timeout, abort, etc.):
   - catch (error):
     - typed = error instanceof EdgarError ? error : new TransportError(String(error), true)
     - if (!typed.retryable || attempt === maxAttempts - 1):
       - throw typed
     - else:
       - Calculate backoff delay
       - Fire telemetry: onRetry
       - await backoff delay
       - attempt++
       - continue loop

10. Error on exhausted attempts:
    - If loop exits without returning, throw new Error("Exhausted retry attempts")
```

**Key implementation details:**
- User-agent header always added (SEC compliance requirement)
- Retry decision ONLY driven by error.retryable flag (not status code directly)
- Telemetry hooks are optional; silence if not provided
- fetchWithTimeoutAndAbort already handles timeout + user signal composition
- Backoff delay calculated via calculateBackoffMs(attempt, this.retries)
- All module composition: limiter, timeout wrapper, retry policy, error mapper, telemetry

**Constraints:**
- Use TimeoutError and other error types from src/errors/index.ts
- Use TokenBucket, calculateBackoffMs, classifyResponseError from sibling modules
- No retry loop leaks: attempt counter tracked, maxAttempts enforced
- Telemetry events include structured data (url, method, statusCode, durationMs, etc.)

**Test coverage in client.test.ts (see Task 2):**
- Rate limiting under load: 100+ concurrent requests
- Retry on 503: verify exactly 3 attempts fire
- No retry on 404: verify single attempt
- Timeout fires: verify TimeoutError after timeoutMs
- User abort respected: verify TransportError with cancelled=true
- Telemetry events captured: verify onRequestStart, onRequestEnd, onRetry fire in sequence
  </action>
  <verify>
pnpm test tests/http/client.test.ts
- All integration tests pass
- Rate limiting verified: 100+ concurrent requests with cap=8 total time ≥12.5s
- Retry logic verified: 503 retries, 404 fails immediately
- Telemetry events verified: captured in correct sequence
  </verify>
  <done>
SecHttpClient class exists in src/http/client.ts, exported. Full orchestration of all five concerns implemented.
Integration tests pass. Rate limiting, retry, timeout, and telemetry verified.
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement comprehensive integration tests (tests/http/client.test.ts) + barrel export (src/http/index.ts)</name>
  <files>tests/http/client.test.ts, src/http/index.ts</files>
  <action>
**Part A: Update src/http/index.ts barrel export**

Export all public items from http module:
```typescript
export { TokenBucket } from "./limiter"
export { combineSignals, fetchWithTimeoutAndAbort } from "./timeout"
export { calculateBackoffMs, type RetryPolicy } from "./retry"
export { classifyResponseError } from "./error-mapper"
export { SecHttpClient } from "./client"
export type { SecHttpClientOptions } from "./client"  // (if defining a specific type; otherwise re-use EdgarClientOptions)
```

**Part B: Implement comprehensive integration tests in tests/http/client.test.ts**

Test structure:
```
describe("SecHttpClient", () => {
  describe("constructor", () => {
    // Validate user-agent enforcement
  })

  describe("rate limiting", () => {
    // Verify token bucket enforcement under load
  })

  describe("retry logic", () => {
    // Verify retryable vs non-retryable classification
  })

  describe("timeout", () => {
    // Verify timeout enforcement
  })

  describe("user abort signal", () => {
    // Verify caller signal respected
  })

  describe("telemetry", () => {
    // Verify telemetry events fire in sequence
  })

  describe("integration", () => {
    // Full-stack scenarios: rate limit + retry + timeout
  })
})
```

**Test cases (detailed):**

1. **Constructor validation:**
   - "rejects empty userAgent" → ConfigurationError thrown
   - "accepts valid userAgent"
   - "accepts custom maxRequestsPerSecond"
   - "rejects invalid maxRequestsPerSecond" (< 1 or > 10)

2. **Rate limiting under load (use fake timers):**
   - "queues 100 concurrent requests, respecting rate cap"
     - Create SecHttpClient with maxRequestsPerSecond=8
     - Mock fetch to return 200 OK immediately
     - Fire 100 concurrent request() calls
     - Measure total elapsed time
     - Verify: elapsed >= 100/8 seconds (12.5s minimum, not instant)
     - Use vi.useFakeTimers() for deterministic timing

3. **Retry on retryable errors:**
   - "retries 503 Service Unavailable (3 attempts total)"
     - Mock fetch: first call returns 503, second returns 503, third returns 200
     - Verify exactly 3 request attempts fire
     - Verify response.status === 200 on final retry
   - "retries 429 Rate Limited (stops on success)"
     - Mock fetch: first call returns 429, second returns 200
     - Verify exactly 2 attempts
   - "retries TimeoutError and rethrows after maxAttempts"
     - Mock fetch to throw TimeoutError on every call
     - Verify 3 attempts fire, then TimeoutError thrown

4. **No retry on non-retryable errors:**
   - "fails immediately on 404 Not Found"
     - Mock fetch: returns 404
     - Verify exactly 1 attempt
     - Verify NotFoundError thrown with statusCode=404 in metadata
   - "fails immediately on 400 Bad Request"
     - Mock fetch: returns 400
     - Verify exactly 1 attempt
     - Verify TransportError thrown with retryable=false

5. **Timeout enforcement:**
   - "throws TimeoutError when request exceeds timeout"
     - Use vi.useFakeTimers()
     - Create SecHttpClient with timeoutMs=100
     - Mock fetch to hang indefinitely
     - Call request()
     - Advance timers by 100ms
     - Verify TimeoutError thrown

6. **User abort signal respected:**
   - "throws TransportError when caller aborts"
     - Create AbortController
     - Call request(url, { signal: controller.signal })
     - Immediately call controller.abort()
     - Verify TransportError thrown with cancelled=true metadata
     - Verify no retry attempted (user cancellation is intentional)

7. **Telemetry events:**
   - "fires onRequestStart before request"
     - Mock telemetry hooks
     - Call request()
     - Verify onRequestStart called with { url, method, timestamp }
   - "fires onRequestEnd after successful request"
     - Mock telemetry hooks
     - Call request() with mock 200 response
     - Verify onRequestEnd called with { url, method, statusCode, durationMs, timestamp }
   - "fires onRetry before backoff delay"
     - Mock telemetry hooks, mock fetch with 503 then 200
     - Call request()
     - Verify onRetry called with { url, attempt, maxAttempts, delayMs, error: "TRANSPORT_ERROR", timestamp }
   - "telemetry hooks optional (no error if undefined)"
     - Call request() without telemetry
     - Verify no error

8. **User-agent header always set:**
   - "adds User-Agent header if not provided"
     - Mock fetch, capture init param
     - Call request(url, {})
     - Verify init.headers["User-Agent"] === this.userAgent
   - "respects existing User-Agent header"
     - Mock fetch, capture init param
     - Call request(url, { headers: { "User-Agent": "custom" } })
     - Verify init.headers["User-Agent"] === "custom" (not overridden)

9. **Integration scenarios:**
   - "rate limit + retry: 100 concurrent requests with 1 retry each"
     - Fire 100 concurrent requests, each mock with { 503, 200 }
     - Verify total time >= (100 * 2) / 8 = 25s (rate limiting applies across retries)
   - "timeout + retry: retry after timeout, eventually succeeds"
     - Mock: first call times out, second succeeds
     - Verify TimeoutError on first attempt, but retried on second
     - Verify final response.status === 200

**Test utilities:**
- Helper to mock fetch globally: `vi.stubGlobal("fetch", mockFetch)`
- Helper to create test client: `createTestClient(overrides?: Partial<SecHttpClientOptions>)`
- Helper to capture telemetry events: `const events: any[] = []` with telemetry callbacks pushing to array

**Key testing constraints:**
- Use Vitest fake timers for deterministic rate limiting tests (no flakiness)
- Mock fetch, not real network calls
- Isolate each test (reset mocks between tests)
- Verify telemetry events in correct sequence (not just presence)
- Test both success and failure paths for each concern
  </action>
  <verify>
pnpm lint
pnpm typecheck
pnpm test tests/http/client.test.ts
- Linting passes
- Type checking passes
- All integration tests pass
- Coverage: >80% of SecHttpClient and retry logic
  </verify>
  <done>
SecHttpClient integration tests written in tests/http/client.test.ts. Barrel export updated in src/http/index.ts.
All HTTP module functionality tested: rate limiting, retry, timeout, user abort, telemetry.
Tests comprehensive and isolated. Coverage >80%.
Ready for Phase 2 (discovery layer depends on SecHttpClient).
  </done>
</task>

</tasks>

<verification>
After task completion:

1. **Files exist and export correctly:**
   - `src/http/client.ts` exports SecHttpClient
   - `src/http/index.ts` barrel file exports all HTTP module items
   - Imports in all files use `@/` path alias

2. **Code quality:**
   - `pnpm lint` passes
   - `pnpm typecheck` passes
   - `pnpm test tests/http/` passes (all limiter, timeout, retry, error-mapper, and client tests)
   - Coverage >80% for src/http/ modules

3. **Rate limiting verified:**
   - SecHttpClient(maxRequestsPerSecond=8) never exceeds 8 req/s
   - 100 concurrent requests with cap=8 total time ≥12.5s

4. **Retry logic verified:**
   - Retryable errors (503, 429, 408, TimeoutError) retry with backoff
   - Non-retryable errors (404, 400) fail immediately
   - Exactly 3 attempts fire (configurable, default)
   - Backoff jitter prevents synchronized retries

5. **Timeout verified:**
   - TimeoutError thrown when AbortSignal.timeout() expires
   - User signal cancellation respected (no retry)
   - Timeout and user abort differentiated correctly

6. **Telemetry verified:**
   - onRequestStart fires before fetch
   - onRequestEnd fires after response
   - onRetry fires before backoff delay
   - Events carry correct metadata (url, method, statusCode, durationMs, etc.)

7. **Integration scenarios tested:**
   - Rate limiting + retry combined
   - Timeout + retry combined
   - User abort without retry

8. **Phase 1 complete:**
   - All 9 requirements (HTTP-01 through HTTP-07, OBSV-01, OBSV-02) ready for verification
   - SecHttpClient ready for consumption by Phase 2 (discovery layer)
</verification>

<success_criteria>
- [ ] `src/http/client.ts` implemented with SecHttpClient class
- [ ] `src/http/index.ts` barrel export updated
- [ ] `tests/http/client.test.ts` with 200+ lines, comprehensive integration tests
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass
- [ ] Rate limiting verified: 100+ concurrent requests respect cap
- [ ] Retry logic verified: 503/429/408 retry, 404/400 fail immediately
- [ ] Timeout verified: TimeoutError after configurable timeout
- [ ] User abort verified: TransportError when caller aborts
- [ ] Telemetry verified: events fire in correct sequence with structured metadata
- [ ] Coverage >80% for all HTTP modules
</success_criteria>

<output>
After completion, create `.planning/phases/01-http-transport-rate-limiting/01-03-SUMMARY.md`

SUMMARY should document:
- SecHttpClient orchestration: limiter → timeout → fetch → error mapper → retry loop
- Rate limiting verified: 100+ concurrent requests with cap=8 take ≥12.5s
- Retry logic verified: driven by error.retryable flag; exactly 3 attempts by default
- Timeout enforcement: AbortSignal.timeout() with user signal composition
- Telemetry: onRequestStart, onRequestEnd, onRetry all fire with structured metadata
- User-agent validation: enforced on construction and added to all requests
- Files created: src/http/client.ts, tests/http/client.test.ts, src/http/index.ts updated
- Phase 1 complete: All 9 requirements (HTTP-01-07, OBSV-01-02) ready for verification
- Next: `/gsd:verify-phase 1` to validate requirements, then plan Phase 2 (discovery)
</output>
