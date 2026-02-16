---
phase: 01-http-transport-rate-limiting
plan: 01
subsystem: http
tags: [rate-limiting, timeout, abort, token-bucket, sec-compliance]
dependency-graph:
  requires: [errors, types]
  provides: [TokenBucket, combineSignals, fetchWithTimeoutAndAbort]
  affects: []
tech-stack:
  added: [token-bucket-algorithm, abort-signal-composition]
  patterns: [promise-chaining, fake-timers-testing]
key-files:
  created:
    - src/http/limiter.ts
    - src/http/timeout.ts
    - tests/http/limiter.test.ts
    - tests/http/timeout.test.ts
  modified:
    - src/http/index.ts
decisions:
  - Sequential promise chain for token bucket fairness (avoids race conditions)
  - combineSignals polyfill for Node 18/20 compatibility (AbortSignal.any() only in Node 22+)
  - Fake timers for timeout tests (avoids real 10s waits in test suite)
  - Capacity equals refill rate to prevent burst escape
metrics:
  duration: 514s
  tasks-completed: 2
  files-created: 4
  files-modified: 1
  test-coverage: 27 tests passing
  commits: 2
completed: 2026-02-16T02:46:11Z
---

# Phase 01 Plan 01: HTTP Transport Rate Limiting Summary

**One-liner:** Token bucket rate limiter (1-10 req/s) and timeout/abort signal composition with Node 18/20/22 + Bun compatibility

## Objective

Build rate limiting and timeout foundations for SecHttpClient as isolated, testable modules ready for integration.

## What Was Built

### 1. TokenBucket Rate Limiter (`src/http/limiter.ts`)

**Implementation:**
- Token bucket algorithm with configurable 1-10 req/s rate
- Capacity equals refill rate (prevents burst escape per SEC compliance)
- Sequential promise chain ensures fairness under concurrent load
- Refills on every acquire() call (no background timer)
- Enforces SEC compliance bounds with validation

**Key Algorithm:**
```typescript
// Refill based on elapsed time
tokens = min(capacity, tokens + elapsed * refillRatePerMs)

// If tokens available: deduct immediately
// If deficit: calculate wait = deficit / refillRatePerMs
```

**Tests:** 13 passing
- Constructor validation (bounds checking)
- Immediate acquire when bucket full
- Burst up to capacity on startup
- Rate cap enforcement under 100+ concurrent load
- Token refill over time
- Capacity ceiling respected
- Fractional token calculations
- Multi-token acquire support

### 2. Timeout/Abort Composition (`src/http/timeout.ts`)

**Implementation:**
- `combineSignals()` polyfill for AbortSignal.any() (Node 18/20 compat)
- `fetchWithTimeoutAndAbort()` with error differentiation:
  - TimeoutError for library timeout (retryable=true)
  - TransportError for caller abort (retryable=false)
- Respects caller signal precedence
- Web-standard API declarations for TypeScript

**Tests:** 14 passing
- Signal combination (empty, single, multiple)
- Already-aborted signal handling
- No double-abort when multiple signals fire
- Fetch success before timeout
- Timeout fires → TimeoutError
- User abort → TransportError
- User abort precedence over timeout
- Non-abort error passthrough

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**Code quality:**
- ✓ `pnpm lint` passes (3 pre-existing warnings in other files)
- ✓ `pnpm typecheck` passes
- ✓ `pnpm test tests/http/` passes (27/27 tests)
- ✓ No `any` types - all exports have explicit type annotations
- ✓ Path alias `@/` used throughout

**Rate limiting behavior:**
- ✓ TokenBucket(8) capacity equals refill rate
- ✓ 100 concurrent acquire(1) calls take ≥11.5s (verified via fake timers)
- ✓ Burst limited to configured capacity
- ✓ Rate cap never exceeded under concurrent load

**Timeout/abort behavior:**
- ✓ Library timeout fires TimeoutError when AbortSignal.timeout() expires
- ✓ User signal abort fires TransportError when caller aborts
- ✓ No race condition when both signal types active
- ✓ combineSignals() polyfill works for Node 18/20

## Technical Decisions

### Decision 1: Sequential Promise Chain for TokenBucket

**Context:** Concurrent acquire() calls need fair, deterministic ordering.

**Options:**
1. No queuing → race conditions, unpredictable token deduction
2. Explicit queue with recursive processing → complex, harder to test with fake timers
3. Promise chain (`lastAcquire.then(...)`) → simple, testable, fair

**Choice:** Promise chain

**Rationale:**
- JavaScript single-threaded execution ensures sequential processing
- Chaining guarantees FIFO order without explicit queue management
- Works seamlessly with Vitest fake timers
- Minimal code complexity

### Decision 2: combineSignals Polyfill vs Native AbortSignal.any()

**Context:** AbortSignal.any() only available in Node 22+, but project targets Node 18+.

**Options:**
1. Require Node 22+ → breaks compatibility requirement
2. External polyfill library → adds dependency, increases bundle size
3. Inline polyfill → zero deps, self-contained

**Choice:** Inline polyfill

**Rationale:**
- Zero dependencies aligns with project constraint
- Simple implementation (~20 lines)
- Node 22+ adoption can use native later (no API change)

### Decision 3: Fake Timers for Timeout Tests

**Context:** Real timeouts (10s+) make tests slow and flaky.

**Options:**
1. Real timers → 10s+ per test, prone to timing issues
2. Short timeouts (100ms) → still slow, potential flakiness
3. Fake timers → instant, deterministic

**Choice:** Fake timers with `vi.advanceTimersByTimeAsync()`

**Rationale:**
- Tests run in <10ms instead of 10s+
- Deterministic timing eliminates flakiness
- Works correctly with AbortSignal.timeout() when properly mocked

## Files Created

| File | Purpose | Lines | Exports |
|------|---------|-------|---------|
| `src/http/limiter.ts` | Token bucket rate limiter | 92 | TokenBucket |
| `src/http/timeout.ts` | Timeout/abort composition | 82 | combineSignals, fetchWithTimeoutAndAbort |
| `tests/http/limiter.test.ts` | Limiter unit tests | 192 | - |
| `tests/http/timeout.test.ts` | Timeout/abort tests | 236 | - |

**Total:** 4 files, 602 lines

## Next Steps

**Immediate (Plan 02):**
- Implement retry policy with exponential backoff + full jitter
- Implement error mapper (HTTP status → typed error classification)
- Integrate TokenBucket + timeout + retry into SecHttpClient

**Dependencies for downstream:**
- Plan 02 can now import TokenBucket and fetchWithTimeoutAndAbort
- SecHttpClient orchestration will compose these modules

## Performance Metrics

| Metric | Value |
|--------|-------|
| Duration | 514s (~8.5 minutes) |
| Tasks completed | 2/2 |
| Tests written | 27 |
| Test pass rate | 100% |
| Commits | 2 |

## Self-Check: PASSED

**Files created:**
- ✓ FOUND: src/http/limiter.ts
- ✓ FOUND: src/http/timeout.ts
- ✓ FOUND: tests/http/limiter.test.ts
- ✓ FOUND: tests/http/timeout.test.ts

**Commits exist:**
- ✓ FOUND: 5e28bfd (Task 1 - TokenBucket)
- ✓ FOUND: ec49d9d (Task 2 - timeout/abort)

**Exports verified:**
- ✓ TokenBucket exported from src/http/index.ts
- ✓ combineSignals exported from src/http/index.ts
- ✓ fetchWithTimeoutAndAbort exported from src/http/index.ts
