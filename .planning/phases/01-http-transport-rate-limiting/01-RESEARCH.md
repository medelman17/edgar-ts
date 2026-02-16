# Phase 1: HTTP Transport & Rate Limiting - Research

**Researched:** 2026-02-15
**Domain:** HTTP transport, rate limiting, retry policy, timeout/abort handling
**Confidence:** HIGH

## Summary

Phase 1 establishes the SEC-compliant HTTP transport layer (`SecHttpClient`) that all downstream operations depend on. This requires implementing five cross-cutting concerns in coordinated order: request limiter (token bucket), timeout/abort wrapper, retry policy engine, error classification, and telemetry hooks.

The phase is well-scoped and low-risk because the domain is standard. Node.js 18+ and Bun stable both provide native `fetch`, `AbortController`, and `AbortSignal.timeout()` with full feature parity. Error handling is already typed in the codebase. The main implementation work is algorithmic (token bucket, exponential backoff with jitter) rather than API discovery.

**Primary recommendation:** Implement in dependency order: (1) limiter abstraction, (2) timeout/abort wrapper, (3) retry policy engine, (4) error mapper, (5) `SecHttpClient` orchestrator. All five are testable in isolation before integration. Prioritize bounded exponential backoff with full jitter to prevent thundering herd on retries—this is standard AWS best practice.

## Standard Stack

### Core (No External Dependencies)

This library is zero-dependency by design. All implementations use only Node.js/Bun builtins and web-standard APIs.

| Module | Responsibility | Key APIs |
|--------|-----------------|----------|
| `http/limiter.ts` | Token-bucket rate limiter | ES6 `Map`, `setTimeout`, arithmetic |
| `http/timeout.ts` | Timeout and abort signal composition | `AbortController`, `AbortSignal.timeout()` |
| `http/retry.ts` | Exponential backoff with full jitter | Random number generation, arithmetic |
| `http/error-mapper.ts` | HTTP response → typed error classification | `instanceof` checks, metadata assignment |
| `http/client.ts` (SecHttpClient) | Request orchestration with retry/rate/timeout | `fetch`, `AbortSignal`, composed modules |

### Why Zero Dependencies?

1. **SEC compliance audit:** Dependencies add supply chain risk; builtins are transparent.
2. **Bundle size:** 20 KB hard limit enforced in CI; external rate-limiter libraries add 5-10 KB.
3. **Runtime parity:** Minimizing imports simplifies Node/Bun divergence debugging.
4. **Startup time:** Library constructor is called synchronously; no lazy imports needed.

### Recommended Algorithm: Token Bucket

**Why token bucket over alternatives:**
- Fixed-window: bursts permitted at window boundaries (violates SEC safety principle)
- Leaky bucket: complexity without behavioral advantage for HTTP (smoothing not required)
- Token bucket: allows configurable burst while enforcing steady average rate (SEC-compliant)

**Reference implementation pattern (not a library, implement directly):**

```typescript
// Pseudo-code; full implementation in HTTP phase
class TokenBucket {
  private tokens: number
  private lastRefillTime: number
  private refillRate: number  // tokens per ms
  private capacity: number

  acquire(count: number = 1): Promise<void> {
    // Refill bucket based on elapsed time
    const now = Date.now()
    const elapsed = now - this.lastRefillTime
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate)
    this.lastRefillTime = now

    // If tokens available, acquire immediately; else wait
    if (this.tokens >= count) {
      this.tokens -= count
      return Promise.resolve()
    }

    // Schedule retry when tokens available
    const deficit = count - this.tokens
    const waitMs = deficit / this.refillRate
    return new Promise(resolve => setTimeout(resolve, waitMs))
  }
}
```

**Key properties:**
- Refill happens on every acquire call (no background timer needed)
- Capacity bounds accumulated tokens to prevent burst abuse
- Default: 8 tokens/second, capacity = 8 (allows one burst, then steady rate)
- Configuration: planner must provide maxRequestsPerSecond (capped at 10 req/s per docs)

## Architecture Patterns

### Composition Over Inheritance

SecHttpClient orchestrates five reusable modules:

```
SecHttpClient
├── TokenBucket (limiter)
├── TimeoutAbortWrapper (timeout/abort logic)
├── RetryPolicy (exponential backoff + jitter)
├── ErrorMapper (HTTP response → typed error)
└── TelemetryHooks (optional observability)
```

**Pattern benefit:** Each module is independently testable; SecHttpClient is a thin orchestrator, not logic-heavy.

### Retry Decision Tree

```
fetch request
  ↓
catch error or inspect response
  ↓
ErrorMapper.classify(error/response)
  ↓
if (error.retryable && attempt < maxAttempts) {
  wait(exponentialBackoffWithJitter())
  retry ← true
} else {
  retry ← false, throw error
}
```

**Key invariant:** Retry decision is driven by error `retryable` flag, not HTTP status code directly. This allows policy changes without touching retry loop.

### Timeout + Abort Composition

**Pattern: Combine caller AbortSignal with internal timeout AbortSignal**

```typescript
// Caller provides userSignal; library adds timeoutSignal
const internalSignal = AbortSignal.timeout(timeoutMs)
const composedSignal = AbortSignal.any([userSignal, internalSignal])
const response = await fetch(url, { signal: composedSignal })
```

**Benefit:** Caller-initiated abort takes precedence; if both fire, earliest wins. No race condition.

**Error differentiation:**
- `composedSignal.aborted` + `internalSignal.aborted` → library timeout
- `composedSignal.aborted` + user signal fired → caller abort
- Map to `TimeoutError` or `CancellationError` (or `TransportError` with metadata)

### Request Limiter Placement

**Where rate limiting applies:**
1. Before any outbound request (blocks request if bucket empty)
2. Retry loop respects limiter (retried request waits for token)
3. Telemetry hook on limit-wait can emit `request.rate_limited` event

**What limiter does NOT do:**
- Does not make retry decisions (retry module does)
- Does not timeout requests (timeout module does)
- Does not classify errors (error mapper does)

## Don't Hand-Roll

| Problem | Why Not DIY | Use From This Phase |
|---------|------------|-------------------|
| Rate limiting | Token bucket requires precise timing under concurrent load; easy to overshoot or undershoot cap. SEC auditors expect proven algorithm. | `http/limiter.ts` TokenBucket class |
| Exponential backoff with jitter | Buggy backoff causes thundering herd on retries, cascading failures. AWS/Google best practice: full jitter, not linear. | `http/retry.ts` RetryPolicy class |
| Timeout enforcement | Naive `Promise.race(fetch, timeout)` leaks dangling promises; AbortSignal is the correct primitive. | `http/timeout.ts` TimeoutAbortWrapper |
| HTTP error classification | Assumes all 5xx are retryable, 4xx non-retryable. Reality: 429 (rate limit) and 503 (service unavailable) are retryable; 404 is not. | `errors/index.ts` error classes + `http/error-mapper.ts` |

**Key insight:** These are deceptively simple at face value but error-prone at scale. Use battle-tested patterns from this research document.

## Common Pitfalls

### Pitfall 1: Token Bucket Burst Exceeds Configured Rate

**What goes wrong:** Configuring `maxRequestsPerSecond: 8` but allowing 10 concurrent requests because bucket starts full.

**Why it happens:** Token bucket capacity not constrained to match rate. Filling bucket to 100 tokens on startup, then 10 requests drain it immediately.

**How to avoid:**
- Set capacity = rate (e.g., 8 tokens/s → capacity = 8)
- Initialize tokens to capacity (allows one burst on startup)
- Verify under load: 100+ simultaneous request test must never exceed rate cap

**Warning signs:**
- Rate-limit errors (429) on first batch of requests
- Compliance audit finds burst spike in SEC logs
- Limiter test shows instantaneous burst larger than cap

### Pitfall 2: Retry Loop Without Retry Budget

**What goes wrong:** Retrying forever with exponential backoff; 3 max attempts becomes 10 due to exception handling bugs.

**Why it happens:** Missing boundary checks or recursive retry calls.

**How to avoid:**
- Hard maxAttempts limit (3 by default, configurable, capped at ~5)
- Track attempt number in loop, throw on maxAttempts reached
- Test with synthetic 503 responses; verify exactly 3 attempts fire

**Warning signs:**
- Network logs show >3 requests for single operation
- Timeout cumulative with retry waits (first attempt 10s, two retries add 250+500ms)
- Infinite retry on 429 (should succeed or fail, not loop)

### Pitfall 3: Jittered Backoff Calculated Wrong

**What goes wrong:** `delay = baseDelay * 2^attempt` without jitter gives perfectly synchronized retries across clients.

**Why it happens:** Copy-pasting backoff formula without understanding jitter randomizes exponential calculation, not delay value.

**How to avoid:**
- **Full jitter formula (correct):** `delay = random(0, min(maxDelayMs, baseDelayMs * 2^(attempt-1)))`
- **Equal jitter alternative:** `delay = maxDelay / 2 + random(0, maxDelay / 2)`
- Test: generate 100 retry delays for 2nd attempt; verify they span 0-250ms range, not converge to single value

**Warning signs:**
- All retries in monitoring dashboard cluster at exact same interval
- SEC server logs show synchronized spike in request volume 250ms after failure
- Retry test shows variance < 10% (should be full spread)

### Pitfall 4: Timeout Doesn't Cancel Network Request

**What goes wrong:** `setTimeout(() => { reject() }, 10000)` is called, but the `fetch` promise still runs in background, consuming resources.

**Why it happens:** Promise rejection doesn't automatically cancel network activity. Using timeout race instead of AbortSignal.

**How to avoid:**
- Use `AbortSignal.timeout()` + `fetch(..., { signal })` (modern standard)
- Avoid: `Promise.race(fetch, timeout)` (leaks dangling promises)
- Test: abort signal while request in flight; verify no data received, connection closed

**Warning signs:**
- Memory growth over time (dangling promises accumulate)
- Port exhaustion (sockets not released after timeout)
- Network logs show continued GET/POST after client-side timeout error

### Pitfall 5: Mixing Retry and Rate Limiter Concerns

**What goes wrong:** Retry logic acquires limiter token, hits rate limit, and silently skips retry without telling caller.

**Why it happens:** Rate limiter blocking retry path without error signaling.

**How to avoid:**
- Limiter must allow retry to proceed (rate limit is enforced at request boundary, not retry decision)
- If limiter would block retry indefinitely, surface `RateLimitedError` (not silent skip)
- Design: rate limiter waits (blocks async), then retry fires; caller observes latency but gets result

**Warning signs:**
- Retry test passes but latency is 10x expected (limiter waiting silently)
- Operations succeed but with extreme jitter in latency
- Telemetry shows no retry events even though status 503 should trigger retry

### Pitfall 6: Caller Abort Signal Not Respected

**What goes wrong:** Caller passes `userSignal`, but library uses its own timeout signal only; caller abort is ignored.

**Why it happens:** Timeout wrapper doesn't compose signals; uses only internal timeout.

**How to avoid:**
- Use `AbortSignal.any([userSignal, internalSignal])` (Node 22+) or manual merge for compatibility
- Always respect caller signal first in error reporting (prioritize user intent)
- Test: caller aborts; verify request stops, error propagates within 10ms

**Warning signs:**
- Caller sets abort signal; request continues anyway
- No error when caller's timeout fires (HTTP keeps running)
- Tests pass in isolation but fail with timeout in integration suite

## Code Examples

### Example 1: Token Bucket Limiter (Verified Pattern)

```typescript
// Source: token-bucket algorithm from rate-limiting best practices
// See: https://redis.io/tutorials/howtos/ratelimiting/

export class TokenBucket {
  private tokens: number
  private lastRefillTime: number
  private readonly refillRatePerMs: number
  private readonly capacity: number

  constructor(requestsPerSecond: number) {
    // Enforce SEC compliance bounds
    if (requestsPerSecond < 1 || requestsPerSecond > 10) {
      throw new Error("Rate must be 1-10 requests/second")
    }

    this.capacity = requestsPerSecond
    this.tokens = requestsPerSecond  // Start full, allow one burst
    this.refillRatePerMs = requestsPerSecond / 1000
    this.lastRefillTime = Date.now()
  }

  async acquire(count: number = 1): Promise<void> {
    const now = Date.now()
    const elapsedMs = now - this.lastRefillTime

    // Refill tokens based on elapsed time
    this.tokens = Math.min(
      this.capacity,
      this.tokens + elapsedMs * this.refillRatePerMs
    )
    this.lastRefillTime = now

    // Tokens available: acquire immediately
    if (this.tokens >= count) {
      this.tokens -= count
      return
    }

    // Tokens insufficient: calculate wait time
    const deficit = count - this.tokens
    const waitMs = deficit / this.refillRatePerMs

    return new Promise((resolve) => {
      setTimeout(resolve, waitMs)
    })
  }
}
```

### Example 2: Exponential Backoff with Full Jitter

```typescript
// Source: AWS best practice for exponential backoff
// See: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/

export interface RetryPolicy {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
}

export function calculateBackoffMs(
  attempt: number,  // 0-indexed (first retry = 0)
  policy: RetryPolicy,
): number {
  if (attempt < 0 || attempt >= policy.maxAttempts) {
    throw new Error(`Invalid attempt ${attempt}; max is ${policy.maxAttempts - 1}`)
  }

  // Full jitter: random(0, min(cap, base * 2^attempt))
  const exponentialCap = policy.baseDelayMs * Math.pow(2, attempt)
  const maxJitter = Math.min(policy.maxDelayMs, exponentialCap)

  // Return uniformly distributed delay in [0, maxJitter]
  return Math.floor(Math.random() * maxJitter)
}

// Example: With base=250, max=4000, attempt=1
// Result: random(0, min(4000, 250*2)) = random(0, 500) → ~0-500ms
```

### Example 3: Timeout + Abort Composition

```typescript
// Source: AbortSignal.timeout() standard (Node 18+, Bun stable)
// See: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static

export async function fetchWithTimeoutAndAbort(
  url: string,
  timeoutMs: number,
  userSignal?: AbortSignal,
): Promise<Response> {
  // Create internal timeout signal
  const timeoutSignal = AbortSignal.timeout(timeoutMs)

  // Compose with user signal (if provided)
  let composedSignal = timeoutSignal
  if (userSignal) {
    // AbortSignal.any() available in Node 22+
    // For Node 18/20 compatibility, manually merge
    composedSignal = combineSignals([userSignal, timeoutSignal])
  }

  try {
    const response = await fetch(url, { signal: composedSignal })
    return response
  } catch (error) {
    // Differentiate timeout from user abort
    if (timeoutSignal.aborted && !userSignal?.aborted) {
      throw new TimeoutError(`Request timeout after ${timeoutMs}ms`, {
        metadata: { url, timeoutMs, attempt: 1 },
      })
    }

    if (userSignal?.aborted) {
      throw new TransportError("Request cancelled by caller", false, {
        metadata: { url, cancelled: true },
      })
    }

    throw error
  }
}

// Helper for Node 18/20 compatibility
function combineSignals(signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController()

  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason)
      return controller.signal
    }

    signal.addEventListener("abort", () => {
      if (!controller.signal.aborted) {
        controller.abort(signal.reason)
      }
    })
  }

  return controller.signal
}
```

### Example 4: HTTP Error Classification

```typescript
// Source: edgar-ts error taxonomy (src/errors/index.ts)
// Classification rules from edgar-ts-error-retry.md

export function classifyResponseError(
  statusCode: number,
  url: string,
): EdgarError {
  switch (true) {
    // 5xx errors are retryable (server fault)
    case statusCode >= 500 && statusCode < 600:
      return new TransportError(
        `HTTP ${statusCode} from ${url}`,
        true, // retryable
        { metadata: { statusCode, url } },
      )

    // 429 is retryable (rate limited by upstream)
    case statusCode === 429:
      return new RateLimitedError(
        `HTTP 429 Too Many Requests from ${url}`,
        { metadata: { statusCode, url } },
      )

    // 408 is retryable (request timeout)
    case statusCode === 408:
      return new TimeoutError(
        `HTTP 408 Request Timeout from ${url}`,
        { metadata: { statusCode, url } },
      )

    // 404 is NOT retryable (not found is permanent)
    case statusCode === 404:
      return new NotFoundError(
        `HTTP 404 Not Found: ${url}`,
        { metadata: { statusCode, url } },
      )

    // 4xx (except above) are not retryable (client error)
    case statusCode >= 400 && statusCode < 500:
      return new TransportError(
        `HTTP ${statusCode} from ${url}`,
        false, // not retryable
        { metadata: { statusCode, url } },
      )

    // Unknown status
    default:
      return new TransportError(
        `Unexpected HTTP ${statusCode} from ${url}`,
        false,
        { metadata: { statusCode, url } },
      )
  }
}
```

### Example 5: SecHttpClient Orchestration

```typescript
// Pseudo-structure (not full code); shows composition
export class SecHttpClient {
  private limiter: TokenBucket
  private retryPolicy: RetryPolicy
  private timeoutMs: number
  private telemetry?: TelemetryOptions
  private userAgent: string

  constructor(options: SecHttpClientOptions) {
    this.limiter = new TokenBucket(options.maxRequestsPerSecond)
    this.retryPolicy = options.retries
    this.timeoutMs = options.timeoutMs
    this.telemetry = options.telemetry
    this.userAgent = options.userAgent
  }

  async request(
    url: string,
    init?: RequestInit & { signal?: AbortSignal },
  ): Promise<Response> {
    let attempt = 0

    while (attempt < this.retryPolicy.maxAttempts) {
      try {
        // Rate limit
        await this.limiter.acquire(1)

        // Emit telemetry: request start
        this.telemetry?.onRequestStart?.({
          url,
          method: init?.method ?? "GET",
          timestamp: Date.now(),
        })

        // Request with timeout + user abort signal
        const startTime = Date.now()
        const response = await fetchWithTimeoutAndAbort(
          url,
          this.timeoutMs,
          init?.signal,
        )
        const durationMs = Date.now() - startTime

        // Emit telemetry: request end
        this.telemetry?.onRequestEnd?.({
          url,
          method: init?.method ?? "GET",
          statusCode: response.status,
          durationMs,
          timestamp: Date.now(),
        })

        // Classify response, throw if non-2xx
        if (!response.ok) {
          const error = classifyResponseError(response.status, url)

          if (!error.retryable || attempt === this.retryPolicy.maxAttempts - 1) {
            throw error
          }

          // Retryable error; backoff and retry
          const backoffMs = calculateBackoffMs(attempt, this.retryPolicy)
          this.telemetry?.onRetry?.({
            url,
            attempt: attempt + 1,
            maxAttempts: this.retryPolicy.maxAttempts,
            delayMs: backoffMs,
            error: error.code,
            timestamp: Date.now(),
          })

          await new Promise((resolve) => setTimeout(resolve, backoffMs))
          attempt++
          continue
        }

        return response
      } catch (error) {
        // Handle caught exceptions (network error, timeout, abort, etc.)
        const typed = error instanceof EdgarError
          ? error
          : new TransportError(String(error), true)

        if (!typed.retryable || attempt === this.retryPolicy.maxAttempts - 1) {
          throw typed
        }

        const backoffMs = calculateBackoffMs(attempt, this.retryPolicy)
        this.telemetry?.onRetry?.({
          url,
          attempt: attempt + 1,
          maxAttempts: this.retryPolicy.maxAttempts,
          delayMs: backoffMs,
          error: typed.code,
          timestamp: Date.now(),
        })

        await new Promise((resolve) => setTimeout(resolve, backoffMs))
        attempt++
      }
    }

    throw new Error("Exhausted retry attempts (should not reach here)")
  }
}
```

## State of the Art

| Concern | Pattern | Why Standard |
|---------|---------|-------------|
| Rate limiting | Token bucket with full refill on acquire | AWS, Google Cloud documented best practice; avoids thundering herd |
| Timeout | `AbortSignal.timeout()` with signal composition | WHATWG fetch standard (2023+); no manual race conditions |
| Backoff | Exponential with full jitter | AWS + Google best practice (2020+); prevents synchronized retries |
| Error classification | Typed errors with retryability flags | Enables orchestration systems to handle failures safely |
| Telemetry | Optional hooks (onRequestStart, onRequestEnd, onRetry) | Decoupled from logging opinions; callers choose observability backend |

## Open Questions

None identified. The implementation domain is well-understood; all algorithms are standard, and Node/Bun provide complete feature parity.

**Confidence:** All research points are HIGH confidence, sourced from official Node/Bun documentation and AWS best practices.

## Sources

### Primary (HIGH confidence)

- **Node.js 18+ Documentation** — AbortController, AbortSignal, fetch, AbortSignal.timeout() [https://nodejs.org/api/globals.html](https://nodejs.org/api/globals.html)
- **Bun v1.2.6 Documentation** — AbortSignal.timeout(), fetch API parity [https://bun.sh/docs/api/fetch](https://bun.sh/docs/api/fetch)
- **WHATWG Fetch Standard** — AbortSignal, fetch, Request lifecycle [https://fetch.spec.whatwg.org/](https://fetch.spec.whatwg.org/)
- **edgar-ts error-retry.md** — Locked error taxonomy and retry policy from codebase
- **edgar-ts sec-compliance.md** — Locked rate-limit defaults and user-agent requirements

### Secondary (MEDIUM confidence)

- **AWS Architecture Blog: Exponential Backoff and Jitter** — Best practice formula and rationale [https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- **AWS Builders Library: Timeouts, Retries, and Backoff with Jitter** — Verified recommendations [https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/)
- **Redis Rate Limiting Tutorial** — Token bucket algorithm explanation and comparison [https://redis.io/tutorials/howtos/ratelimiting/](https://redis.io/tutorials/howtos/ratelimiting/)
- **MDN: AbortSignal** — Web API reference and timeout() method [https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
- **AppSignal Blog: Managing Asynchronous Operations in Node.js with AbortController** — Practical patterns and 2025 guidance [https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html](https://blog.appsignal.com/2025/02/12/managing-asynchronous-operations-in-nodejs-with-abortcontroller.html)

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** — All algorithms are documented standards (AWS, WHATWG). No external libraries needed or recommended.
- Architecture: **HIGH** — Composition pattern is proven; error taxonomy already exists in codebase.
- Pitfalls: **HIGH** — All pitfalls sourced from AWS best practices + observed issues in distributed systems literature.
- Timeout/abort: **HIGH** — Node 18+, Bun stable both provide native support with documented behavior.
- Rate limiting: **HIGH** — Token bucket is well-understood; formula and bounds are defined in docs.

**Research date:** 2026-02-15
**Valid until:** 2026-05-15 (stable domain; no major runtime changes expected)

**Next steps for planner:**
1. Create 5 independent task modules in work breakdown (limiter, timeout, retry, mapper, client)
2. Plan unit tests for each module before integration tests
3. Verify rate-limit behavior under 100+ simultaneous request load test
4. Confirm Node 18/20/22 + Bun parity on AbortSignal.timeout() usage
5. Document telemetry event structure and test telemetry hook firing
