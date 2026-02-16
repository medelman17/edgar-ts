---
phase: 01-http-transport-rate-limiting
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/http/limiter.ts
  - src/http/timeout.ts
  - tests/http/limiter.test.ts
  - tests/http/timeout.test.ts
autonomous: true

must_haves:
  truths:
    - "Token bucket never permits burst exceeding configured rate (8 req/s default)"
    - "Rate limiter queues requests correctly under concurrent load (100+ simultaneous)"
    - "Timeout AbortSignal correctly terminates fetch after configured delay"
    - "Caller-provided AbortSignal takes precedence over library timeout"
    - "Signal composition (AbortSignal.any) works on Node 18, 20, 22 + Bun"
  artifacts:
    - path: "src/http/limiter.ts"
      provides: "TokenBucket class with acquire() method"
      exports: ["TokenBucket"]
      min_lines: 60
    - path: "src/http/timeout.ts"
      provides: "TimeoutAbortWrapper with composeSignals() helper for Node 18/20 compatibility"
      exports: ["TimeoutAbortWrapper", "combineSignals"]
      min_lines: 50
    - path: "tests/http/limiter.test.ts"
      provides: "TokenBucket unit tests: capacity bounds, refill timing, concurrent acquire"
      min_lines: 80
    - path: "tests/http/timeout.test.ts"
      provides: "Timeout/abort composition tests: internal timeout, user signal, combined signal"
      min_lines: 60
  key_links:
    - from: "src/http/limiter.ts"
      to: "TokenBucket constructor"
      via: "Enforce capacity = refillRate to prevent burst"
      pattern: "capacity.*refillRate"
    - from: "src/http/timeout.ts"
      to: "combineSignals"
      via: "Compose caller and library signals without race condition"
      pattern: "AbortSignal\\.any|combineSignals"
    - from: "tests/http/limiter.test.ts"
      to: "src/http/limiter.ts"
      via: "Verify 100+ concurrent requests never exceed rate cap"
      pattern: "concurrent.*burst|Promise\\.all"
    - from: "tests/http/timeout.test.ts"
      to: "src/http/timeout.ts"
      via: "Verify timeout fires and user signal respected"
      pattern: "timeoutSignal\\.aborted|userSignal\\.aborted"
---

<objective>
Build rate limiting and timeout foundations for SecHttpClient.

Purpose: Implement token-bucket rate limiter (default 8 req/s) and timeout/abort signal composition as isolated, testable modules. These two features are orthogonal and can be built in parallel.

Output: Two modules (`http/limiter.ts`, `http/timeout.ts`) with unit tests proving:
- Rate limiter never bursts beyond configured rate, even under 100+ simultaneous requests
- Timeout correctly aborts requests; caller signal takes precedence
- Full compatibility with Node 18/20/22 and Bun (AbortSignal.any or manual merge)
</objective>

<execution_context>
@./.claude/get-shit-done/workflows/execute-plan.md
@./.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/REQUIREMENTS.md
@.planning/phases/01-http-transport-rate-limiting/01-RESEARCH.md
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@src/types/index.ts
@src/errors/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement TokenBucket rate limiter (src/http/limiter.ts)</name>
  <files>src/http/limiter.ts</files>
  <action>
Create token-bucket rate limiter class with the following specification:

**Class:** TokenBucket
- Constructor: `TokenBucket(requestsPerSecond: number)`
  - Enforce bounds: 1-10 requests/second (SEC compliance, configurable)
  - Reject out-of-bounds with Error("Rate must be 1-10 requests/second")
  - Set capacity = requestsPerSecond (not higher; prevents burst abuse)
  - Initialize tokens to capacity (allows one burst on startup)
  - Store refillRatePerMs = requestsPerSecond / 1000
  - Record lastRefillTime = Date.now()

- Method: `acquire(count: number = 1): Promise<void>`
  - Calculate elapsed time since last refill
  - Refill tokens: tokens = min(capacity, tokens + elapsed * refillRatePerMs)
  - Update lastRefillTime to now
  - If tokens >= count: deduct count, return immediately (resolve)
  - If tokens < count: calculate waitMs = (count - tokens) / refillRatePerMs
  - Schedule setTimeout(resolve, waitMs), return promise

**Key constraints:**
- Use only Date.now() and setTimeout (no external dependencies)
- Capacity must equal refillRate to prevent burst escape (TEST THIS)
- Refill happens on every acquire call (not background timer)
- Thread-safe for concurrent calls (JavaScript is single-threaded; await handles ordering)

**Test coverage in limiter.test.ts:**
- TokenBucket(8) starts full (8 tokens available)
- First acquire(1) succeeds immediately
- TokenBucket(1) rejects 11 (out of bounds)
- With capacity=8, 100 concurrent acquire(1) calls take ≥100/8 seconds total (never burst above 8/sec)
- Verify via fake timers: advance 100ms → ~0.8 tokens available (not more)
  </action>
  <verify>
pnpm test tests/http/limiter.test.ts
- All unit tests pass
- Rate cap verified: 100 concurrent requests with capacity=8 should take ≥12.5s (100 req / 8 req/s)
  </verify>
  <done>
TokenBucket class exists in src/http/limiter.ts, exported. Capacity constraint enforced.
Unit tests pass. Rate limiter never exceeds configured rate under concurrent load.
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement timeout/abort composition (src/http/timeout.ts)</name>
  <files>src/http/timeout.ts</files>
  <action>
Create timeout and abort signal composition utilities with the following specification:

**Function:** combineSignals(signals: AbortSignal[]): AbortSignal
- For Node 18/20 compatibility (AbortSignal.any() added in Node 22)
- Create new AbortController
- For each signal:
  - If already aborted: abort controller with that reason, return immediately
  - Add event listener for "abort" event
  - On abort: if controller not already aborted, abort with signal.reason
- Return controller.signal
- Note: This is a polyfill; Node 22+ has native AbortSignal.any()

**Class:** TimeoutAbortWrapper (or utility functions; pattern is flexible)
- Purpose: Wrap fetch with timeout + user signal composition
- **Function:** fetchWithTimeoutAndAbort(url: string, timeoutMs: number, userSignal?: AbortSignal): Promise<Response>
  - Create timeoutSignal = AbortSignal.timeout(timeoutMs)
  - If userSignal provided: compose = combineSignals([userSignal, timeoutSignal])
  - Else: compose = timeoutSignal
  - Call fetch(url, { signal: compose })
  - On error: differentiate between library timeout and user abort
    - If timeoutSignal.aborted AND userSignal not aborted → throw TimeoutError
    - If userSignal?.aborted → throw TransportError with cancelled metadata
    - Else: re-throw original error

**Error differentiation:**
- TimeoutError: "Request timeout after {timeoutMs}ms", retryable=true
  - Include metadata: { url, timeoutMs, attempt: 1 }
  - Use TimeoutError from src/errors/index.ts (already defined, retryable=true)
- TransportError: "Request cancelled by caller", retryable=false
  - Include metadata: { url, cancelled: true }
  - Reason: Caller abort is intentional; no retry

**Test coverage in timeout.test.ts:**
- combineSignals([signal1, signal2]): fires on first signal abort
- combineSignals with already-aborted signal: returns aborted controller immediately
- fetchWithTimeoutAndAbort times out: throws TimeoutError after timeoutMs
- fetchWithTimeoutAndAbort with user signal: user abort throws TransportError, not timeout
- fetchWithTimeoutAndAbort with both signals: earlier fires first (test with ~equal timing)

**Constraints:**
- Use only native web APIs: AbortController, AbortSignal.timeout()
- No external dependencies
- Test on Node 18+ (AbortSignal.timeout() available; AbortSignal.any() only on 22+)
  </action>
  <verify>
pnpm test tests/http/timeout.test.ts
- All unit tests pass
- Timeout fires correctly; user signal respected
- Combined signals compose without race condition
  </verify>
  <done>
Timeout/abort wrapper exists in src/http/timeout.ts. combineSignals polyfill for Node 18/20.
fetchWithTimeoutAndAbort correctly differentiates timeout vs user abort.
Unit tests pass. Signal composition tested.
  </done>
</task>

</tasks>

<verification>
After task completion:

1. **Files exist and export correctly:**
   - `src/http/limiter.ts` exports TokenBucket
   - `src/http/timeout.ts` exports combineSignals, fetchWithTimeoutAndAbort (or equivalent utilities)
   - `src/http/index.ts` barrel file updated to re-export from limiter.ts and timeout.ts

2. **Code quality:**
   - `pnpm lint` passes (Biome checks)
   - `pnpm typecheck` passes (TypeScript strict)
   - `pnpm test tests/http/` passes (all limiter and timeout tests)
   - No `any` types; use `unknown` with type narrowing
   - Path alias `@/` used for all imports within src/

3. **Rate limiting behavior verified:**
   - TokenBucket(8) capacity equals refillRate
   - 100 concurrent acquire(1) calls total ≥12.5s (not instant burst)
   - Fake timers used in tests to avoid flakiness

4. **Timeout/abort behavior verified:**
   - Library timeout fires (TimeoutError) when AbortSignal.timeout() expires
   - User signal abort fires (TransportError) when caller aborts
   - No race condition when both signal types active
</verification>

<success_criteria>
- [ ] `src/http/limiter.ts` implemented with TokenBucket class
- [ ] `src/http/timeout.ts` implemented with signal composition and fetchWithTimeoutAndAbort
- [ ] `tests/http/limiter.test.ts` with 80%+ line coverage
- [ ] `tests/http/timeout.test.ts` with 80%+ line coverage
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass
- [ ] Rate limiter never exceeds 8 req/s under concurrent load (verified in tests)
- [ ] Timeout and user abort differentiated correctly
</success_criteria>

<output>
After completion, create `.planning/phases/01-http-transport-rate-limiting/01-01-SUMMARY.md`

SUMMARY should document:
- TokenBucket implementation: capacity = rate, refill on acquire, no burst escape
- combineSignals polyfill: Node 18/20 compat, no race condition
- Test coverage: rate limiting under 100+ concurrent load, timeout vs abort differentiation
- Files created: src/http/limiter.ts, src/http/timeout.ts, tests/http/limiter.test.ts, tests/http/timeout.test.ts
- Next: Move to Plan 02 (retry policy + error mapper)
</output>
