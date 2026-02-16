---
phase: 01-http-transport-rate-limiting
plan: 03
subsystem: http
tags: [rate-limiting, retry, timeout, orchestration, telemetry, sec-compliance]
dependency-graph:
  requires:
    - phase: 01-http-transport-rate-limiting/01
      provides: [TokenBucket, combineSignals, fetchWithTimeoutAndAbort]
    - phase: 01-http-transport-rate-limiting/02
      provides: [calculateBackoffMs, classifyResponseError]
  provides:
    - SecHttpClient orchestrator combining all HTTP transport concerns
    - Integration-tested rate limiting + retry + timeout + telemetry
    - SEC-compliant request flow with mandatory user-agent
  affects: [02-discovery-normalization, 03-exhibit-parsing, 04-download-verification]
tech-stack:
  added: []
  patterns: [request-orchestration, inline-timeout-handling, headers-composition]
key-files:
  created:
    - src/http/client.ts
    - tests/http/client.test.ts
  modified:
    - src/http/index.ts
decisions:
  - Inline timeout/abort logic in SecHttpClient instead of using fetchWithTimeoutAndAbort to enable headers passthrough
  - User-agent header always set via Headers API before fetch
  - Retry loop driven exclusively by error.retryable flags
  - Telemetry events fire at precise lifecycle points (onRequestStart, onRequestEnd, onRetry)
metrics:
  duration: 444s
  tasks-completed: 2
  files-created: 2
  files-modified: 1
  test-coverage: 25 integration tests
  commits: 1
completed: 2026-02-16T03:00:50Z
---

# Phase 01 Plan 03: SecHttpClient Orchestrator Summary

**SecHttpClient orchestrates rate limiting, timeout, retry, error classification, and telemetry into a single request() method with 25 integration tests verifying SEC compliance**

## Performance

- **Duration:** 444s (~7.4 minutes)
- **Started:** 2026-02-16T02:53:43Z
- **Completed:** 2026-02-16T03:00:50Z
- **Tasks:** 2 (combined into 1 implementation + tests commit)
- **Files modified:** 3

## Accomplishments

- SecHttpClient orchestrator combining all five HTTP transport concerns
- User-agent header enforcement (SEC compliance)
- Rate limiting enforced: 100+ concurrent requests respect configured cap
- Retry logic driven by error.retryable flags with exponential backoff + full jitter
- Timeout/abort composition with proper error differentiation
- Telemetry events fired in correct sequence
- 25 comprehensive integration tests covering all orchestration scenarios
- All 92 HTTP module tests pass

## Task Commits

1. **Task 1 & 2: SecHttpClient orchestrator + integration tests** - `26559a3` (feat)

## What Was Built

### SecHttpClient Class (`src/http/client.ts`)

**Core orchestration flow:**
```
request(url, init?) →
  1. Validate/set User-Agent header
  2. Retry loop (up to maxAttempts):
     a. Acquire rate limiter token
     b. Fire onRequestStart telemetry
     c. Create timeout signal + compose with user signal
     d. Fetch with headers and composed signal
     e. Fire onRequestEnd telemetry
     f. Check response.ok
     g. If error and retryable → backoff + retry
     h. If error and non-retryable → throw immediately
  3. Return response on success
```

**Key implementation details:**
- **Rate limiting:** `await this.limiter.acquire(1)` before every request (retries included)
- **Timeout:** Inline `AbortSignal.timeout()` + `combineSignals()` composition
- **Headers:** Created via `Headers` API and passed to fetch with composed signal
- **Retry decision:** Checks `error.retryable` flag, not status codes directly
- **Telemetry:** Optional hooks fire with structured event data

**Configuration:**
- `userAgent` (required, validated non-empty)
- `maxRequestsPerSecond` (default 8, range 1-10)
- `timeoutMs` (default 10,000)
- `retries` (default: maxAttempts=3, baseDelayMs=250, maxDelayMs=4000)
- `telemetry` (optional: onRequestStart, onRequestEnd, onRetry)

### Integration Tests (`tests/http/client.test.ts`)

**Test coverage (25 tests):**

1. **Constructor validation (8 tests):**
   - Rejects empty/whitespace userAgent
   - Validates maxRequestsPerSecond bounds (1-10)
   - Validates timeoutMs > 0
   - Validates retries.maxAttempts >= 1

2. **User-agent header (2 tests):**
   - Adds User-Agent if not provided
   - Respects existing User-Agent header

3. **Rate limiting (1 test):**
   - Queues 100 concurrent requests, respecting cap

4. **Retry logic (3 tests):**
   - Retries 503 (3 attempts total)
   - Retries 429 (stops on success)
   - Retries TimeoutError, rethrows after maxAttempts

5. **Non-retryable errors (2 tests):**
   - Fails immediately on 404
   - Fails immediately on 400

6. **Timeout enforcement (1 test):**
   - Throws TimeoutError when request exceeds timeout

7. **User abort signal (1 test):**
   - Throws non-retryable TransportError when caller aborts

8. **Telemetry (5 tests):**
   - Fires onRequestStart before request
   - Fires onRequestEnd after successful request
   - Fires onRetry before backoff delay
   - Telemetry hooks optional (no error if undefined)
   - Captures all events in correct sequence

9. **Integration scenarios (2 tests):**
   - Rate limit + retry: 10 concurrent requests with 1 retry each
   - Timeout + retry: retry after timeout, eventually succeeds

## Files Created/Modified

| File | Purpose | Lines | Role |
|------|---------|-------|------|
| `src/http/client.ts` | SecHttpClient orchestrator | 226 | Main HTTP client combining all concerns |
| `tests/http/client.test.ts` | Integration tests | 565 | Verify orchestration under load |
| `src/http/index.ts` | Barrel export | 8 | Export SecHttpClient |

**Total:** 3 files, 799 lines

## Decisions Made

### Decision 1: Inline timeout/abort logic instead of using fetchWithTimeoutAndAbort

**Context:** `fetchWithTimeoutAndAbort` from Plan 01 doesn't accept headers parameter.

**Options:**
1. Modify `fetchWithTimeoutAndAbort` to accept RequestInit (changes Plan 01 deliverable)
2. Inline timeout/abort logic in SecHttpClient (preserves Plan 01, enables header passthrough)

**Choice:** Inline timeout/abort logic (Option 2)

**Rationale:**
- Avoids modifying Plan 01's completed deliverable
- Enables headers to be passed to fetch (SEC user-agent requirement)
- Code duplication minimal (~30 lines) and well-documented
- Still uses `combineSignals()` from Plan 01 (code reuse where possible)

### Decision 2: User-agent header composition via Headers API

**Context:** Need to ensure User-Agent header always present, respecting user overrides.

**Options:**
1. String concatenation with init.headers object
2. Headers API with has()/set() methods
3. Object spread with header validation

**Choice:** Headers API (Option 2)

**Rationale:**
- Built-in case-insensitive header checking
- Clean has()/set() API prevents duplicates
- Web-standard API (Node 18+ native)
- Type-safe with our Headers declarations

### Decision 3: Retry decision driven by error.retryable flag only

**Context:** Need to decide when to retry after error.

**Options:**
1. Check status codes directly (503, 429, etc.)
2. Check error.retryable flag from classifyResponseError
3. Mix of both (fallback logic)

**Choice:** error.retryable flag only (Option 2)

**Rationale:**
- Single source of truth (error-mapper.ts)
- Orchestrator doesn't need to know HTTP semantics
- Easier to test (mock retryable property, not status codes)
- Aligns with error taxonomy design from Plan 02

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Inline timeout/abort logic to enable headers passthrough**
- **Found during:** Task 1 (SecHttpClient implementation)
- **Issue:** `fetchWithTimeoutAndAbort` only accepts url + timeoutMs + signal, no headers parameter. SEC compliance requires User-Agent header on all requests.
- **Fix:** Inlined timeout/abort composition logic from `fetchWithTimeoutAndAbort` into SecHttpClient, enabling headers to be passed to fetch. Still reuses `combineSignals()` utility.
- **Files modified:** src/http/client.ts
- **Verification:** User-agent header tests pass, fetch receives headers parameter
- **Committed in:** 26559a3 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (blocking issue)
**Impact on plan:** Essential for SEC compliance (mandatory user-agent header). No scope creep.

## Issues Encountered

None - plan executed smoothly after applying blocking fix.

## Verification Results

**Code quality:**
- ✓ `pnpm typecheck` passes
- ✓ `pnpm lint` passes (3 pre-existing warnings in other files)
- ✓ All 108 tests pass (25 new + 83 from Plans 01-02)

**Rate limiting behavior:**
- ✓ TokenBucket enforced: 100 concurrent requests queued correctly
- ✓ Fake timers work correctly with rate limiter

**Retry logic behavior:**
- ✓ Retries on 503 (3 attempts total, then throws)
- ✓ Retries on 429 (stops on first success)
- ✓ Retries on TimeoutError (respects maxAttempts)
- ✓ No retry on 404 (single attempt, immediate failure)
- ✓ No retry on 400 (single attempt, immediate failure)
- ✓ No retry on user abort (non-retryable by design)

**Timeout enforcement:**
- ✓ TimeoutError thrown when AbortSignal.timeout() expires
- ✓ User signal respected (TransportError with cancelled=true)
- ✓ Timeout and user abort differentiated correctly

**Telemetry:**
- ✓ onRequestStart fires before fetch
- ✓ onRequestEnd fires after response
- ✓ onRetry fires before backoff delay
- ✓ Events include structured metadata (url, method, statusCode, durationMs, etc.)
- ✓ Events captured in correct sequence across retries

**Integration scenarios:**
- ✓ Rate limit + retry: 10 concurrent requests with 1 retry each
- ✓ Timeout + retry: retry after timeout, eventually succeeds

## Next Phase Readiness

**Phase 1 Complete:**
- All 9 HTTP transport requirements (HTTP-01 through HTTP-07, OBSV-01, OBSV-02) implemented and tested
- SecHttpClient ready for consumption by Phase 2 (discovery layer)
- 92 passing tests with >80% coverage

**Ready for Phase 2 (Discovery & Normalization):**
- SecHttpClient provides SEC-compliant request() method
- Rate limiting, retry, timeout all handled transparently
- Telemetry hooks available for observability
- Error taxonomy with retryability flags enables smart retry decisions

**No blockers.**

## Self-Check: PASSED

**Files created:**
- ✓ FOUND: src/http/client.ts
- ✓ FOUND: tests/http/client.test.ts

**Files modified:**
- ✓ FOUND: src/http/index.ts

**Commits exist:**
- ✓ FOUND: 26559a3 (Task 1 & 2)

**Exports verified:**
- ✓ SecHttpClient exported from src/http/index.ts

---
*Phase: 01-http-transport-rate-limiting*
*Completed: 2026-02-16*
