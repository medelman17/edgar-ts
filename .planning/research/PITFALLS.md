# Domain Pitfalls: SEC EDGAR HTTP Client Implementation

**Project:** edgar-ts
**Domain:** SEC EDGAR API client with HTTP rate limiting, retry, and normalization
**Researched:** 2026-02-15

---

## Critical Pitfalls

Mistakes that cause major rewrites or data corruption.

### Pitfall 1: Rate Limiting Not Applied Globally

**What goes wrong:**
You implement rate limiting per endpoint (e.g., one limiter for discovery, another for downloads) or per request type. Traffic stays under each endpoint's limit but exceeds SEC's global 10 req/s cap. SEC throttles or blocks IP.

**Why it happens:**
Natural instinct to isolate concerns. Discovery might be "fast," downloads "slow," so separate limits feel appropriate. But SEC doesn't care—it counts all outbound traffic.

**Consequences:**
- SEC returns HTTP 429 or silently drops requests
- Library appears to hang (requests disappear into void)
- Blame falls on library, not deployment
- Integration test failures intermittent and hard to debug

**Prevention:**
- Implement rate limiting in `SecHttpClient` *before all fetch() calls*, not per-service
- Token bucket is global per client instance
- All retries still count against the cap
- Design tests that verify: "100 requests never exceed 10 req/s globally"

**Detection:**
- Monitor request frequency; if approaching 10 req/s average, alert
- Log SEC 429 responses; if any occur, rate limiter failed
- Simulation tests fail: "expected delay > Xms, got Yms"

---

### Pitfall 2: Token Bucket Capacity Exceeds Configured Rate

**What goes wrong:**
You set `TokenBucket(capacity: 20, refillRate: 10)` thinking capacity allows small bursts. Over time, tokens accumulate above the refill rate, and you send 20 requests in quick succession, exceeding SEC's limits.

**Why it happens:**
Confusing "burst allowance" with "safe maximum." You want to allow quick successive requests, so you increase capacity. But capacity must equal or be lower than refill rate to guarantee the cap.

**Consequences:**
- Bursts exceed SEC rate limit
- SEC throttles or blocks
- Determinism broken; timing-dependent bugs

**Prevention:**
- Always set `capacity <= refillRate`
- For 10 req/s SEC cap: `TokenBucket(10, 10)` is correct
- For 8 req/s library default: `TokenBucket(8, 8)` is correct
- Spike tests: verify 1000 requests spread to exactly 1000/cap seconds

**Detection:**
- Unit test: simulate 100 rapid requests, measure actual rate in requests/second, assert <= configured limit
- Integration test: measure time for N requests, confirm N/time <= cap

---

### Pitfall 3: Retry Loop Accumulates Requests Without Rate Limiting

**What goes wrong:**
You implement retry in the service layer (e.g., `DiscoveryService`) with its own retry loop. When a request fails and retries, it bypasses the rate limiter. Net result: 1 failure + 2 retries = 3 requests within rate limit window, violating the cap.

**Why it happens:**
Retry logic seems like it should be near the business logic (discovery, download). So you add a retry loop in each service. But rate limiting must wrap the entire operation, including retries.

**Consequences:**
- Retry traffic escapes rate limiting
- Under-load conditions, you exceed SEC cap
- Unpredictable behavior; only manifests under failure

**Prevention:**
- Implement retry *only* in `SecHttpClient`, never in service layers
- All outbound `fetch()` calls must go through `SecHttpClient.fetch()`, which applies rate limiting before and between retry attempts
- Services delegate all transport to `SecHttpClient`; no retry logic in services

**Detection:**
- Code review: grep services for `setTimeout`, `setInterval`, `await new Promise` — should be zero (retry is in `SecHttpClient` only)
- Integration test under failure: simulate 429 responses, verify actual request rate stays under cap during retry

---

### Pitfall 4: Normalization Not Idempotent

**What goes wrong:**
Your normalization functions are idempotent in isolation (e.g., "pad CIK to 10 digits") but together produce different results on second pass. Example: normalizing `accessionNo` strips hyphens, then adds them back in different positions. Second pass produces different output.

**Why it happens:**
Each normalization rule is simple, so you don't think about composition. But if callers cache and re-normalize, or if library normalizes twice (unlikely but possible), you get divergent results.

**Consequences:**
- Deduplication fails; same filing appears twice
- Sorting unstable; results vary across calls
- Tests pass (single pass) but production fails (double-normalize scenario)
- Data integrity compromised

**Prevention:**
- Test normalization functions with multiple passes: `normalize(normalize(data)) === normalize(data)`
- Document order of operations (e.g., "trim, then pad, then uppercase")
- Unit tests: assert idempotence for 5+ iterations
- Fix: ensure each rule is purely functional; no side effects

**Detection:**
- Property-based test: generate random data, apply normalize N times (N=1..10), assert all results identical
- Integration test: normalize, persist, fetch, normalize again, assert identical

---

### Pitfall 5: Missing Pagination Breaks Large Filing Lists

**What goes wrong:**
You query `data.sec.gov/submissions/CIK##########.json` for a company with 50,000 filings. The API response includes `filings.recent[]` (last ~1000) and `filings.files[]` (array of additional file URLs). You ignore `files[]`, return only the recent 1000, and miss 49,000 filings.

**Why it happens:**
SEC API response structure is unintuitive. The `files` field is easy to miss. Developers focus on the obvious `recent` array. Initial testing uses small CIKs (e.g., Apple, ~20 filings), so pagination never triggers.

**Consequences:**
- Large filing lists incomplete
- Silent data loss; no error raised
- Downstream code handles truncated data unexpectedly
- Hard to debug: "SEC API only returns 1000 filings"

**Prevention:**
- Read API docs carefully; `files[]` is documented
- Unit test with mock response including `files[]` array; assert additional files are fetched
- Integration test against real large-filer CIK (e.g., BRK.B, JPM, MSFT — all have 1000+ filings)
- Implement `DiscoveryService` to check `filings.files` and fetch all files iteratively

**Detection:**
- Query known large-filer CIK, assert result count > 1000
- Code inspection: search for `filings.files`; must be handled

---

### Pitfall 6: User-Agent Validation Too Lenient

**What goes wrong:**
You accept empty, placeholder, or non-compliant user-agents at client construction (e.g., `userAgent: ""`, `userAgent: "python-requests/2.28.0"`). Library works in tests but fails in production when SEC rejects the request or throttles non-identified traffic.

**Why it happens:**
Validation seems optional; you add it "just in case." But SEC explicitly rejects anonymous bots. You want to fail fast at construction, not at first request.

**Prevention:**
- Constructor must validate user-agent format: `<app>/<version> (<contact>)`
- Reject empty strings, placeholders, generic strings
- Throw `ConfigurationError` at construction if invalid
- Unit test: constructor rejects empty, placeholder, malformed agents; accepts valid ones

**Detection:**
- Constructor tests: `expect(() => new EdgarClient({ userAgent: "" })).toThrow()`
- Code review: user-agent validation must happen in constructor, before any HTTP client initialization

---

## Moderate Pitfalls

### Pitfall 7: Timeout Too Short or Missing

**What goes wrong:**
You set timeout to 1 second. SEC API sometimes takes 2-3 seconds for large filings. Requests time out frequently, appear as failures, trigger retries, create load spikes.

Or you forget to set timeout. Requests hang indefinitely, consuming resources, appearing frozen.

**Prevention:**
- Default timeout: 5-10 seconds (SEC is usually fast but not guaranteed)
- Make timeout configurable; allow callers to override
- Unit test: confirm timeout fires on slow endpoint
- Load test: measure actual SEC response times, set timeout above P99

**Detection:**
- Monitor timeout rate; if > 1% of requests, investigate SEC performance or adjust timeout
- Check logs for "timeout" errors; should be rare

---

### Pitfall 8: Exhibit Type Matching Not Normalized

**What goes wrong:**
You filter exhibits by comparing raw `type` field: `if (exhibit.type === "EX-10") {...}`. But SEC returns mixed formats: `EX-10`, `EX_10`, `EX/10`, `EX-10.1`, etc. Your filter misses valid contracts.

**Prevention:**
- Normalize before comparison: uppercase, replace `_` and `/` with `-`
- Unit test with all variant formats: `EX-10`, `EX_10`, `EX/10`, `EX-10.1`, `EX-10.01`, `EX-10A`
- Integration test: run against real filings, verify filter catches all expected contracts

**Detection:**
- Query known filing with contract exhibits, assert all are captured
- Code review: contract filter must normalize type before matching

---

### Pitfall 9: CIK Padding Not Applied Universally

**What goes wrong:**
You pad CIK to 10 digits during discovery but forget to pad in download request. Identity keys drift: discovery uses `0001234567`, download uses `1234567`. Deduplication fails; same filing treated as different.

**Prevention:**
- Centralize CIK normalization: single function, used everywhere
- `FilingRef` and `ExhibitRef` CIK must always be 10-digit padded
- Unit test: `assert normalizeCIK("1234").length === 10`
- Integration test: verify identity keys consistent across discovery and download

**Detection:**
- Code inspection: all CIK usage must call normalization function
- Integration test: assert deduplication works across discovery and download

---

### Pitfall 10: Accession Format Inconsistency

**What goes wrong:**
SEC returns accession in mixed formats: `0000320193-25-000005`, `0000320193-25-000005` (hyphens), or `000032019325000005` (no hyphens). Your code expects one format. Deduplication, caching, identity keys break.

**Prevention:**
- Canonical format: `##########-##-######` (hyphens)
- Convert all accessions to canonical on normalize
- Unit test: accept both formats, confirm normalized to canonical
- Integration test: real SEC responses with varied formats, verify normalization

**Detection:**
- Test accession normalization: `assert normalizeAccession("000032019325000005") === "0000320193-25-000005"`

---

## Minor Pitfalls

### Pitfall 11: Date Validation Missing

**What goes wrong:**
Query with `from: "2025-13-01"` (invalid month). Library doesn't validate, passes to SEC, gets 400 or strange results.

**Prevention:**
- Validate date format: `YYYY-MM-DD`
- Validate month in [1, 12], day in [1, 31]
- Throw `ValidationError` on invalid date
- Unit test: reject invalid dates, accept valid ones

---

### Pitfall 12: MIME Type Missing for Exhibits

**What goes wrong:**
SEC sometimes omits MIME type header for exhibit downloads. Your code assumes `response.headers.get("content-type")` always returns a value. Downstream code fails.

**Prevention:**
- Make MIME type optional in `DownloadedExhibit`
- If SEC omits MIME type, set to `undefined`, not empty string
- Document: "MIME type may be undefined if SEC doesn't provide"
- Unit test: mock response without MIME type header

---

### Pitfall 13: SHA-256 Hex String Inconsistency

**What goes wrong:**
You compute hash as uppercase hex string, but tests expect lowercase. Or you compute once, cache, then recompute with different case. Integrity checks fail.

**Prevention:**
- Always convert SHA-256 digest to lowercase hex
- Unit test: assert hash is lowercase, length 64
- Integration test: recompute hash, verify matches original

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| **Phase 1: HTTP Transport** | Rate limiting capacity exceeds configured rate | Verify capacity <= refillRate in unit tests; spike test 100+ requests |
| **Phase 1: HTTP Transport** | Timeout too short or missing | Test timeout behavior; set default 5-10s; make configurable |
| **Phase 1: HTTP Transport** | User-agent validation lenient | Constructor must validate format, reject empty/placeholders |
| **Phase 2: Discovery** | Pagination ignored (filings.files) | Implement filings.files iteration; integration test large-filer CIK |
| **Phase 2: Discovery** | Normalization not idempotent | Property-based test: normalize 10x, assert all identical |
| **Phase 2: Discovery** | CIK padding inconsistent | Centralize normalizeCIK(); use everywhere |
| **Phase 3: Exhibit Filtering** | Exhibit type not normalized before matching | Normalize (uppercase, replace _/, etc.) before filtering; test all variants |
| **Phase 4: Download** | MIME type missing breaks code | Make MIME type optional in DownloadedExhibit; handle undefined |
| **Phase 4: Download** | SHA-256 case inconsistency | Convert to lowercase; unit test hex format and length |
| **Phase 5: Error Handling** | Retry bypasses rate limiting | Retry only in SecHttpClient; all fetch() calls go through it |

---

## Sources

### SEC EDGAR
- [SEC.gov EDGAR APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- [data.sec.gov API Pagination](https://data.sec.gov/)

### Rate Limiting and Retry Best Practices
- [AWS: Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- [Token Bucket Algorithm](https://codesignal.com/learn/courses/throttling-api-requests/lessons/throttling-api-requests-with-token-bucket-1/)

### Data Integrity and Normalization
- [Idempotent Operations](https://en.wikipedia.org/wiki/Idempotence)
- [Canonical Data Representation](https://en.wikipedia.org/wiki/Canonical_form)
