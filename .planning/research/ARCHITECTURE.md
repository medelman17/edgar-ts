# Architecture Patterns: SEC EDGAR HTTP Client

**Project:** edgar-ts
**Domain:** HTTP client with rate limiting, retry, and deterministic normalization
**Researched:** 2026-02-15
**Pattern Foundation:** Web-standard APIs (fetch, AbortSignal, crypto.subtle) + inline implementations of rate limiting, retry, error mapping

---

## Recommended Architecture

The system follows a layered, modular design where the public `EdgarClient` facade delegates to specialized internal modules. Each module owns a single responsibility: transport, rate limiting, discovery, exhibit parsing, filtering, download, or error mapping.

```
┌─────────────────────────────────────────────────────────────┐
│                      EdgarClient (Public)                    │
│                     [Facade / Orchestrator]                  │
└──────────────┬──────────────────────────────────────────────┘
               │
      ┌────────┴────────┬──────────────┬──────────────┬───────────────┐
      │                 │              │              │               │
      ▼                 ▼              ▼              ▼               ▼
  ┌────────┐   ┌─────────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐
  │Discovery   │  ExhibitSvc  │  │ Download │  │Normalize │  │ ErrorMapper  │
  │  Service   │  [Exhibit    │  │ Service  │  │ Helpers  │  │ [Error Types]│
  │  [Filing   │   Detail &   │  │ [Bytes + │  │ [CIK,    │  │ [Retryable?] │
  │   Query]   │   List]      │  │  Hash]   │  │ Accession│  │              │
  └────────┘   └─────────────┘  └──────────┘  └──────────┘  └──────────────┘
      ▲              ▲               ▲              ▲              ▲
      │              │               │              │              │
      └──────────────┴───────────────┴──────────────┴──────────────┘
                     │
              ┌──────▼──────────────────────────────┐
              │   SecHttpClient [Transport]         │
              │ ┌────────────────────────────────┐  │
              │ │ Token Bucket Rate Limiter      │  │
              │ │ (10 req/s, ~30 lines inline)   │  │
              │ ├────────────────────────────────┤  │
              │ │ native fetch() + headers       │  │
              │ │ AbortSignal.timeout()          │  │
              │ │ Exponential backoff + jitter   │  │
              │ │ Telemetry hooks                │  │
              │ └────────────────────────────────┘  │
              └──────┬───────────────────────────────┘
                     │
                     ▼
            ┌──────────────────┐
            │ SEC EDGAR API    │
            │ (data.sec.gov)   │
            │ (REST/JSON)      │
            └──────────────────┘
```

---

## Component Boundaries and Responsibilities

### 1. EdgarClient (Public Facade)

**Responsibility:** High-level API surface, parameter validation, orchestration.

**Communication:** Delegates to `DiscoveryService`, `ExhibitService`, `DownloadService`, all via `SecHttpClient`.

**What It Does NOT Do:**
- No HTTP logic (delegated to `SecHttpClient`)
- No parsing logic (delegated to services)
- No rate limiting (delegated to `SecHttpClient`)
- No persistence (no disk writes)
- No caching (stateless)

---

### 2. SecHttpClient (HTTP Transport + Rate Limiting)

**Responsibility:** All transport concerns: rate limiting, timeout, retry, headers, error classification.

**Internal Subsystems:**

#### Token Bucket Rate Limiter
- **Capacity:** `rateLimit` (tokens, default 8)
- **Refill rate:** `rateLimit` tokens per second
- **Burst allowance:** Same as capacity
- **On acquire:** Block until token available, then decrement

#### Timeout via AbortSignal
- Use `AbortSignal.timeout(ms)` (native, Node 17+, Bun 1.0+)
- Support caller-provided abort signal via `AbortSignal.any([...])`
- Convert timeout to `TimeoutError` with metadata

#### Exponential Backoff with Full Jitter
- Base delay: 250ms
- Max delay: 4000ms (4s)
- Max attempts: 3
- Formula: `delay = random(0, min(4000, 250 * 2^(attempt-1)))`
- Apply only to retryable errors (classified by `ErrorMapper`)

#### Header Management
- Enforce user-agent (format: `<app>/<version> (<contact@email>)`)
- Reject empty/placeholder agents at construction
- Add standard headers: `Content-Type: application/json`, `User-Agent`

#### Telemetry Hooks
- Emit typed events (no logging; caller decides):
  - `request.start` → `{ operation, url, attempt }`
  - `request.end` → `{ operation, url, attempt, statusCode, latencyMs }`
  - `request.retry` → `{ operation, url, attemptNum, delayMs, reason }`
  - `request.rate_limited` → `{ operation, url, waitMs }`
  - `request.failed` → `{ operation, url, statusCode, error }`

**Communication:** Consumed by all service layers (DiscoveryService, ExhibitService, DownloadService).

---

### 3. DiscoveryService (Filing Discovery)

**Responsibility:** Query SEC EDGAR API for filings, normalize, deduplicate, sort.

**Workflow:**

1. Validate input (CIK, dates, form types)
2. Build SEC query URL
3. Fetch via SecHttpClient
4. Parse JSON response (handle pagination if `filings.files[]` present)
5. Normalize each filing (CIK padding, accession format, dates)
6. Filter by date bounds and form type
7. Deduplicate by `{cik}:{accessionNo}` identity key
8. Stable sort: filingDate asc, accessionNo asc
9. Return `FilingRef[]`

---

### 4. ExhibitService (Exhibit Enumeration)

**Responsibility:** Resolve filing details, extract exhibit list, normalize exhibits.

**Workflow:**

1. Validate filing input
2. Resolve filing-detail page URL
3. Fetch filing detail via SecHttpClient
4. Parse HTML/XBRL to extract exhibit list
5. Normalize each exhibit (accession, sequence, type, description, filename)
6. Deduplicate by `{accessionNo}:{sequence}` identity key
7. Stable sort: sequence asc, filename asc
8. Return `ExhibitRef[]`

---

### 5. ContractExhibitFilter (EX-10* Filtering)

**Responsibility:** Match and filter exhibits to only `EX-10*` contract exhibits.

**Matching Rules:**

After normalizing exhibit type (uppercase, punctuation-normalized), accept:
- `EX-10` (exact)
- `EX-10.1`, `EX-10.01`, ... (dotted forms)
- `EX-10A`, `EX-10B`, ... (lettered forms)

Reject:
- Non-10 families (`EX-4`, `EX-99`, etc.)
- Empty or unmappable types

---

### 6. DownloadService (Binary Exhibit Fetch)

**Responsibility:** Fetch exhibit bytes, compute SHA-256, capture metadata.

**Workflow:**

1. Validate exhibit input
2. Fetch via SecHttpClient
3. Read bytes from response.arrayBuffer()
4. Capture mimeType from headers
5. Calculate sizeBytes
6. Compute SHA-256 via crypto.subtle.digest()
7. Return `DownloadedExhibit { exhibit, bytes, mimeType, sizeBytes, sha256 }`

---

### 7. ErrorMapper (Error Classification)

**Responsibility:** Convert raw HTTP/validation failures to typed library errors with retryability flags.

**Taxonomy:**

| Error Class | Retryable | Cause |
|-------------|-----------|-------|
| `ConfigurationError` | No | Invalid client config |
| `ValidationError` | No | Invalid input |
| `RateLimitError` | Yes | HTTP 429 or rate limiter blocked |
| `TimeoutError` | Yes | Request timeout |
| `NetworkError` | Yes | Network unreachable |
| `Upstream5xxError` | Yes | HTTP 5xx from SEC |
| `Upstream4xxError` | No | HTTP 4xx (except 429) |
| `NotFoundError` | No | HTTP 404 |
| `NormalizationError` | No | Failed to parse response |
| `IntegrityError` | No | Cryptographic operation failed |
| `UnknownEdgarError` | No | Unmapped error |

---

## Patterns to Follow

### Pattern 1: Token Bucket Rate Limiting

**What:** Enforce per-second rate cap without external dependencies.

**When:** Always in `SecHttpClient` before outbound fetch.

**Why:** SEC enforces 10 req/s globally. In-memory token bucket is simple, fast, testable.

---

### Pattern 2: Timeout via AbortSignal

**What:** Set request timeout using native `AbortSignal.timeout()`.

**When:** Every `fetch()` call in `SecHttpClient`.

**Why:** Requests can hang indefinitely. `AbortSignal.timeout()` is clean, standard.

---

### Pattern 3: Full-Jitter Exponential Backoff

**What:** Retry transient failures with randomized exponential delay.

**When:** In `SecHttpClient` retry loop for retryable errors.

**Why:** AWS-recommended; spreads load evenly without thundering herd.

---

### Pattern 4: Typed Error Classification

**What:** Classify errors (retryable vs. non-retryable) at transport layer.

**When:** In `ErrorMapper` when converting raw failures to library errors.

**Why:** Allows callers and orchestration to make retry decisions based on error type.

---

### Pattern 5: Canonical Normalization + Deduplication

**What:** Normalize data to canonical form, deduplicate by identity key, sort stably.

**When:** In discovery and exhibit enumeration services.

**Why:** Ensures deterministic output, idempotent caching, prevents duplicate processing.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Rate Limiting per Endpoint
**Why Bad:** SEC enforces 10 req/s *globally*. Per-endpoint limiting doesn't prevent global cap violation.
**Instead:** Apply rate limiting at transport layer (before all `fetch()` calls).

### Anti-Pattern 2: Retry Without Backoff
**Why Bad:** Thundering herd — all clients retry simultaneously, hammering server.
**Instead:** Use exponential backoff with jitter.

### Anti-Pattern 3: Generic Retry for All Errors
**Why Bad:** Retrying non-transient errors wastes time and resources.
**Instead:** Classify errors with `retryable` flag; retry only retryable errors.

### Anti-Pattern 4: Mutable Normalization
**Why Bad:** Callers may accidentally mutate normalized data, breaking determinism.
**Instead:** Return immutable normalized objects.

### Anti-Pattern 5: Ignoring Pagination
**Why Bad:** SEC API returns paginated results for large filing lists.
**Instead:** Check `filings.files[]` array; fetch additional pages.

---

## Scalability Considerations

| Concern | At 100 Users | At 10K Users | At 1M Users |
|---------|--------------|--------------|-------------|
| **Rate Limiting** | Token bucket, 10 req/s, single instance | Single instance sufficient | Distributed token bucket (Redis) |
| **Network Bandwidth** | Minimal | Still manageable; cache responses | Cache aggressively; proxy/CDN |
| **Memory (HTTP Client)** | Token bucket = O(1) | Still minimal | No change |
| **Error Handling** | Simple retry/backoff | Add circuit breaker | Distributed circuit breaker |
| **Observability** | Basic telemetry | Structured logging, metrics | Distributed tracing, SLO monitoring |
| **Data Volume** | In-memory | Still in-memory | Streaming results |

**Note:** edgar-ts is a library. Scalability concerns are *caller's* responsibility.

---

## Sources

### Web Standards and Native APIs
- [MDN: fetch API](https://developer.mozilla.org/en-US/docs/Web/API/fetch)
- [MDN: AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal)
- [Node.js: Fetch API Documentation](https://nodejs.org/api/fetch.html)

### Rate Limiting and Retry
- [AWS: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Token Bucket Algorithm](https://codesignal.com/learn/courses/throttling-api-requests/lessons/throttling-api-requests-with-token-bucket-1/)

### SEC EDGAR
- [SEC.gov EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [data.sec.gov](https://data.sec.gov/)
