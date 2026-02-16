---
phase: 01-http-transport-rate-limiting
plan: 02
type: execute
wave: 2
depends_on: ["01-http-transport-rate-limiting/01"]
files_modified:
  - src/http/retry.ts
  - src/http/error-mapper.ts
  - tests/http/retry.test.ts
  - tests/http/error-mapper.test.ts
autonomous: true

must_haves:
  truths:
    - "Exponential backoff with full jitter produces uniformly distributed delays (0 to cap), not synchronized spikes"
    - "Retry attempts never exceed maxAttempts (default 3, capped at ~5)"
    - "Retryable errors (429, 503, 408) classified correctly; non-retryable (404, 400) never retried"
    - "HTTP status codes mapped to typed errors (TransportError, RateLimitedError, TimeoutError, NotFoundError)"
    - "Error metadata (statusCode, url) preserved for debugging/observability"
  artifacts:
    - path: "src/http/retry.ts"
      provides: "RetryPolicy interface and calculateBackoffMs(attempt, policy) function"
      exports: ["calculateBackoffMs", "RetryPolicy"]
      min_lines: 40
    - path: "src/http/error-mapper.ts"
      provides: "classifyResponseError(statusCode, url) function mapping HTTP status → typed error"
      exports: ["classifyResponseError"]
      min_lines: 60
    - path: "tests/http/retry.test.ts"
      provides: "Exponential backoff tests: jitter variance, attempt bounds, formula verification"
      min_lines: 70
    - path: "tests/http/error-mapper.test.ts"
      provides: "HTTP status classification tests: 2xx success, 4xx non-retryable, 5xx retryable, edge cases"
      min_lines: 80
  key_links:
    - from: "src/http/retry.ts"
      to: "calculateBackoffMs"
      via: "Full jitter formula: random(0, min(maxDelayMs, baseDelayMs * 2^attempt))"
      pattern: "Math\\.random.*Math\\.pow|Math\\.min"
    - from: "src/http/error-mapper.ts"
      to: "classifyResponseError"
      via: "Map status codes to error classes with correct retryability flags"
      pattern: "statusCode.*case|RateLimitedError|NotFoundError"
    - from: "tests/http/retry.test.ts"
      to: "src/http/retry.ts"
      via: "Generate 100 delays per attempt; verify they span expected range (not converged)"
      pattern: "for.*100|variance|Math\\.min.*Math\\.max"
    - from: "tests/http/error-mapper.test.ts"
      to: "src/http/error-mapper.ts"
      via: "Verify 503 → TransportError(retryable=true), 404 → NotFoundError(retryable=false)"
      pattern: "expect.*retryable|case.*statusCode"
---

<objective>
Build retry policy and error classification engines.

Purpose: Implement exponential backoff with full jitter (AWS best practice) and HTTP-to-error mapping. These two features are orthogonal and can be built in parallel. Retry policy drives retry loop decisions; error mapper enables retryable classification.

Output: Two modules (`http/retry.ts`, `http/error-mapper.ts`) with unit tests proving:
- Exponential backoff produces uniformly distributed jitter (no thundering herd)
- Error classification correct: 429/503/408 retryable, 404/400 non-retryable
- Metadata preserved in errors for observability
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
@.planning/codebase/CONVENTIONS.md
@.planning/codebase/TESTING.md
@src/types/index.ts
@src/errors/index.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Implement exponential backoff with full jitter (src/http/retry.ts)</name>
  <files>src/http/retry.ts</files>
  <action>
Create retry policy module with exponential backoff and full jitter calculation:

**Interface:** (already in types, this exports the calculation function)
- Export the RetryPolicy type from src/types/index.ts (it's already defined there)
- Document that default values: maxAttempts=3, baseDelayMs=250, maxDelayMs=4000

**Function:** calculateBackoffMs(attempt: number, policy: RetryPolicy): number
- Input: attempt (0-indexed; first retry = 0), policy object
- Validate: if attempt < 0 or attempt >= policy.maxAttempts, throw Error
- Calculate exponential cap: exponentialCap = baseDelayMs * (2 ^ attempt)
- Calculate maximum jitter: maxJitter = min(maxDelayMs, exponentialCap)
- Return: floor(random(0, maxJitter))
  - Generates uniformly distributed value in [0, maxJitter]
  - Full jitter formula (AWS best practice)

**Examples (with defaults: base=250, max=4000):**
- attempt=0: maxJitter=min(4000, 250*1)=250 → random(0,250) → 0-250ms
- attempt=1: maxJitter=min(4000, 250*2)=500 → random(0,500) → 0-500ms
- attempt=2: maxJitter=min(4000, 250*4)=1000 → random(0,1000) → 0-1000ms
- attempt=3: maxJitter=min(4000, 250*8)=2000 → random(0,2000) → 0-2000ms
- attempt=4: maxJitter=min(4000, 250*16)=4000 → random(0,4000) → 0-4000ms
- attempt=5+: maxJitter=4000 (capped) → random(0,4000) → 0-4000ms

**Key constraints:**
- Use Math.random() * maxJitter (uniformly distributed)
- Use Math.floor() to get integer milliseconds
- No external randomness library needed
- Formula ensures no synchronization across concurrent clients (full jitter, not linear)

**Test coverage in retry.test.ts:**
- calculateBackoffMs(0, policy) returns value in [0, 250)
- calculateBackoffMs(4, policy) returns value in [0, 4000)
- generateDelays(100, attempt, policy) — generates 100 delays, verifies variance
  - For attempt=2 (maxJitter=1000): all delays in [0,1000), mean ~500, variance > 100 (not synchronized)
  - For attempt=4+ (capped at 4000): all delays in [0,4000), mean ~2000, variance > 500
- Test with custom policy: baseDelayMs=100, maxDelayMs=1000, maxAttempts=3
  - Calculate delays, verify they respect custom bounds
  </action>
  <verify>
pnpm test tests/http/retry.test.ts
- All unit tests pass
- Jitter distribution verified: 100 delays for same attempt have variance > threshold (no convergence)
- Attempt bounds enforced: attempt >= maxAttempts throws error
  </verify>
  <done>
calculateBackoffMs function exists in src/http/retry.ts, exported. Exponential backoff with full jitter implemented.
Unit tests pass. Jitter distribution verified to prevent synchronized retries.
  </done>
</task>

<task type="auto">
  <name>Task 2: Implement HTTP status → typed error mapper (src/http/error-mapper.ts)</name>
  <files>src/http/error-mapper.ts</files>
  <action>
Create error classification module mapping HTTP status codes to typed errors:

**Function:** classifyResponseError(statusCode: number, url: string): EdgarError
- Input: HTTP response status code, URL for metadata
- Return: Typed error with correct retryability flag
- Implementation: switch statement on statusCode

**Mapping rules (from edgar-ts-error-retry.md):**

1. **5xx errors (500-599): retryable**
   - Return TransportError("HTTP {statusCode} from {url}", true, { metadata: { statusCode, url } })

2. **429 Too Many Requests: always retryable**
   - Return RateLimitedError("HTTP 429 Too Many Requests from {url}", { metadata: { statusCode, url } })
   - Note: This indicates external rate limiting; always worth retrying

3. **408 Request Timeout: retryable**
   - Return TimeoutError("HTTP 408 Request Timeout from {url}", { metadata: { statusCode, url } })
   - Note: Server timeout, not client-side timeout (see TimeoutAbortWrapper for client timeout)

4. **404 Not Found: non-retryable**
   - Return NotFoundError("HTTP 404 Not Found: {url}", { metadata: { statusCode, url } })
   - Reason: Filing/exhibit truly does not exist; permanent condition

5. **Other 4xx (400-403, 405-499): non-retryable**
   - Return TransportError("HTTP {statusCode} from {url}", false, { metadata: { statusCode, url } })
   - Reason: Client error; retrying won't help (malformed request, auth, method not allowed, etc.)

6. **All other status codes: non-retryable**
   - Return TransportError("Unexpected HTTP {statusCode} from {url}", false, { metadata: { statusCode, url } })

**Key constraints:**
- Use error classes from src/errors/index.ts (already implemented)
- Always include metadata: { statusCode, url }
- No assumptions about status codes beyond what's listed
- Metadata enables caller observability/debugging

**Test coverage in error-mapper.test.ts:**
- classifyResponseError(200, url) → no error (caller should check response.ok first)
  - Actually: function assumes non-2xx status. If 200 passed, return TransportError("Unexpected...") or handle gracefully
  - Better: function is only called for error responses (response.ok === false)
  - Test only non-2xx codes (let caller handle 2xx)
- classifyResponseError(500, url) → TransportError(retryable=true)
- classifyResponseError(503, url) → TransportError(retryable=true)
- classifyResponseError(429, url) → RateLimitedError(retryable=true), check code="RATE_LIMITED"
- classifyResponseError(408, url) → TimeoutError(retryable=true), check code="TIMEOUT"
- classifyResponseError(404, url) → NotFoundError(retryable=false), check code="NOT_FOUND"
- classifyResponseError(400, url) → TransportError(retryable=false)
- classifyResponseError(403, url) → TransportError(retryable=false)
- classifyResponseError(999, url) → TransportError(retryable=false, "Unexpected...")
- All errors include metadata with statusCode and url
  </action>
  <verify>
pnpm test tests/http/error-mapper.test.ts
- All unit tests pass
- Status code classification verified: 5xx retryable, 4xx non-retryable (except specific cases)
- Error metadata contains statusCode and url
- RateLimitedError, TimeoutError, NotFoundError used for specific cases
  </verify>
  <done>
classifyResponseError function exists in src/http/error-mapper.ts, exported. HTTP status → error mapping implemented.
Unit tests pass. All status codes classified with correct retryability.
Metadata preserved in all errors.
  </done>
</task>

</tasks>

<verification>
After task completion:

1. **Files exist and export correctly:**
   - `src/http/retry.ts` exports calculateBackoffMs
   - `src/http/error-mapper.ts` exports classifyResponseError
   - `src/http/index.ts` barrel file updated to re-export from retry.ts and error-mapper.ts

2. **Code quality:**
   - `pnpm lint` passes (Biome checks)
   - `pnpm typecheck` passes (TypeScript strict)
   - `pnpm test tests/http/` passes (all retry and error-mapper tests)
   - No `any` types; use `unknown` with type narrowing
   - Path alias `@/` used for all imports

3. **Retry policy verified:**
   - Exponential backoff formula correct: base * 2^attempt
   - Full jitter applied: random(0, min(max, exponential))
   - 100 delays per attempt have high variance (not synchronized)

4. **Error classification verified:**
   - 5xx status codes → retryable errors
   - 429 → RateLimitedError (retryable)
   - 408 → TimeoutError (retryable)
   - 404 → NotFoundError (non-retryable)
   - Other 4xx → non-retryable TransportError
   - Metadata always present (statusCode, url)
</verification>

<success_criteria>
- [ ] `src/http/retry.ts` implemented with calculateBackoffMs function
- [ ] `src/http/error-mapper.ts` implemented with classifyResponseError function
- [ ] `tests/http/retry.test.ts` with jitter distribution variance tests
- [ ] `tests/http/error-mapper.test.ts` with HTTP status classification tests
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` all pass
- [ ] Jitter variance verified: 100 delays for same attempt span expected range
- [ ] HTTP status codes classified with correct retryability flags
- [ ] All errors include statusCode and url metadata
</success_criteria>

<output>
After completion, create `.planning/phases/01-http-transport-rate-limiting/01-02-SUMMARY.md`

SUMMARY should document:
- RetryPolicy implementation: exponential backoff with full jitter (AWS best practice)
- Jitter variance verified: 100 retries per attempt never converge (prevents thundering herd)
- classifyResponseError mapping: 5xx/429/408 retryable, 404/4xx non-retryable
- Error metadata: all errors include statusCode and url for observability
- Files created: src/http/retry.ts, src/http/error-mapper.ts, tests/http/retry.test.ts, tests/http/error-mapper.test.ts
- Next: Move to Plan 03 (SecHttpClient orchestrator + integration tests)
</output>
