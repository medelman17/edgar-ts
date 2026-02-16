# Project Research Summary

**Project:** edgar-ts
**Domain:** Compliant SEC EDGAR HTTP client with rate limiting, retry logic, and deterministic normalization
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

edgar-ts is a TypeScript library for discovering and downloading SEC EDGAR filings with built-in compliance, reliability, and determinism. The recommended approach uses native web-standard APIs (`fetch`, `AbortSignal`, `crypto.subtle`) with lightweight inline implementations of rate limiting (token bucket), exponential backoff, and error classification—zero external runtime dependencies. The architecture is layered: a public `EdgarClient` facade delegates to specialized internal services (Discovery, Exhibit, Download) through a `SecHttpClient` transport layer that centralizes all HTTP concerns (rate limiting, timeout, retry). The critical risk is rate limiting mistakes (applying per-endpoint instead of globally, or allowing retries to escape the limiter), which would cause SEC to block requests silently. Comprehensive tests during Phase 1 (simulating 100+ requests, verifying actual rate never exceeds 10 req/s) are essential to prevent this. With careful attention to rate limiting and normalization idempotence, the implementation is straightforward—all patterns are documented and proven in production systems.

## Key Findings

### Recommended Stack

The stack is deliberately minimal, using only native web-standard APIs available in Node.js 18+ and Bun 1.0+. No external runtime dependencies.

**Core technologies:**
- **Native `fetch` API** — HTTP transport — Web standard, available in all modern runtimes, zero overhead
- **`AbortSignal.timeout()`** — Request timeouts — Modern alternative to AbortController + setTimeout, clean and native
- **Token Bucket (custom, ~30 lines)** — Rate limiting at 10 req/s — Trivial to implement, well-understood algorithm, testable
- **Exponential backoff with full jitter (custom, ~10 lines)** — Retry strategy — AWS-standard approach, spreads load without thundering herd
- **`crypto.subtle.digest("SHA-256")`** — Hash verification — Web standard, native in both Node and Bun, no polyfills needed
- **Typed error classification (custom)** — Error handling — Maps HTTP/validation failures to retryable vs. non-retryable classes

**Why zero dependencies:** Token bucket, retry logic, and hashing are all trivial implementations (30-50 lines total). External libraries add only overhead for features not needed (Redis, sliding windows, distributed state). Inline implementations are faster, clearer, and eliminate supply-chain risk.

**See:** [STACK.md](./STACK.md) for full implementation patterns, SEC EDGAR API endpoints, and runtime compatibility matrix.

### Expected Features

**Must have (table stakes):**
- Filing discovery by CIK with form-type and date-range filtering
- Exhibit enumeration from filings
- Contract exhibit filtering (EX-10* only)
- Exhibit download with SHA-256 integrity verification
- Rate limiting at 10 req/s (SEC compliance)
- Typed errors with retryability flags (orchestration-friendly)
- User-agent validation (SEC requirement)
- Deterministic normalization and deduplication

**Should have (competitive differentiators):**
- Exponential backoff with jitter (reduces server load during retries)
- Pagination support for large filing lists (1000+ filings)
- Caller-provided abort signals for cancellation
- Telemetry hooks (observability without forced logging opinions)
- Zero runtime dependencies (lighter, safer installation)

**Defer (v2+):**
- Circuit breaker (detecting SEC outages)
- Streaming results (v1 scope is simple arrays)
- Additional exhibit families (EX-4, EX-99)
- Batch operations

**Anti-features to explicitly NOT build:** Persistence, caching, content parsing (PDF/HTML), full-text search, distributed rate limiting (single-instance token bucket only).

**API surface (v1):**
```typescript
client.discoverFilings({ cik?, formTypes?, from?, to? })        // FilingRef[]
client.listExhibits(filing)                                    // ExhibitRef[]
client.listContractExhibits(filing)                            // ExhibitRef[] (EX-10* only)
client.downloadExhibit(exhibit)                                // DownloadedExhibit
```

**See:** [FEATURES.md](./FEATURES.md) for detailed feature matrix, dependencies, and MVP recommendation.

### Architecture Approach

The system follows a layered, modular design where the public `EdgarClient` facade delegates to specialized internal services, all communicating through a centralized `SecHttpClient` transport layer. This pattern ensures rate limiting, retry, and timeout logic are applied uniformly—no service can accidentally bypass controls.

**Major components:**
1. **EdgarClient** — Public facade, parameter validation, orchestration
2. **SecHttpClient** — Transport layer: rate limiting (token bucket), timeout (AbortSignal), retry (exponential backoff), telemetry hooks, error classification
3. **DiscoveryService** — Filing query, parsing, normalization, deduplication, sorting
4. **ExhibitService** — Filing detail resolution, exhibit list extraction, normalization
5. **ContractExhibitFilter** — EX-10* matching with format normalization
6. **DownloadService** — Exhibit fetch, SHA-256 computation, metadata capture
7. **ErrorMapper** — Convert HTTP/validation failures to typed library errors with retryability

**Key pattern:** All services delegate *all* HTTP calls to `SecHttpClient`, which applies rate limiting before and between retries. This prevents bypasses and ensures the 10 req/s cap is never exceeded.

**See:** [ARCHITECTURE.md](./ARCHITECTURE.md) for component diagram, anti-patterns to avoid, and scalability notes.

### Critical Pitfalls

1. **Rate limiting not applied globally** — Implementing per-endpoint or per-request-type limits allows overall traffic to exceed SEC's 10 req/s cap, causing silent failures or throttling. **Prevention:** Implement rate limiting in `SecHttpClient` *before all fetch() calls*. Design tests that verify 100 requests never exceed configured rate. Detect with monitoring for SEC 429 responses.

2. **Token bucket capacity exceeds refill rate** — Setting `capacity > refillRate` allows bursts that violate SEC limits (e.g., capacity 20 with refill rate 10 results in 20 requests in quick succession). **Prevention:** Always ensure `capacity <= refillRate`. For SEC: `TokenBucket(10, 10)`. For library default (8 req/s): `TokenBucket(8, 8)`. Spike test 100+ rapid requests and measure actual rate.

3. **Retry accumulates requests outside rate limiter** — Implementing retry in service layers instead of transport layer allows retry attempts to escape rate limiting. **Prevention:** Implement retry *only* in `SecHttpClient`. All outbound `fetch()` calls must go through it, ensuring rate limiting wraps retries. Code review should find zero `setTimeout`/retry logic in services.

4. **Normalization not idempotent** — Normalization rules that individually work but together diverge on second pass break deduplication and sorting. **Prevention:** Test idempotence: `normalize(normalize(data)) === normalize(data)` for 5+ iterations. Use property-based testing to verify consistency across multiple passes.

5. **Pagination ignored for large filing lists** — SEC API's `filings.files[]` array is easy to miss; ignoring it silently truncates results (1000 filings instead of 50,000). **Prevention:** Implement `DiscoveryService` to iterate `filings.files[]` and fetch all pages. Integration test against real large-filer CIK (BRK.B, JPM, MSFT). Code review must find `filings.files` handling.

**See:** [PITFALLS.md](./PITFALLS.md) for 13 total pitfalls (6 critical, 4 moderate, 3 minor) with phase-specific warnings.

## Implications for Roadmap

Based on research, the implementation has clear phases with strict dependencies. Rate limiting, timeout, and error classification must be rock-solid before any other work proceeds.

### Phase 1: HTTP Transport & Rate Limiting
**Rationale:** Foundation for all downstream work. Rate limiting, timeout, retry, and error classification are non-negotiable requirements; they must be correct before any business logic runs.

**Delivers:**
- `SecHttpClient` with token bucket (10 req/s cap)
- Timeout via `AbortSignal.timeout(5s)`
- Exponential backoff (250ms base, 4s cap, max 3 attempts) with full jitter
- User-agent validation (reject empty/placeholder agents)
- Typed error classification with retryability flags
- Telemetry hooks (no logging; typed events)

**Features addressed:**
- Rate limiting (table stakes)
- Timeout enforcement (table stakes)
- Typed errors (table stakes)
- User-agent requirement (table stakes)
- Exponential backoff (differentiator)
- Telemetry hooks (differentiator)

**Pitfalls to avoid:**
- Token bucket capacity >= refill rate
- Retry bypasses rate limiting
- User-agent too lenient
- Timeout missing or too short

**Research flag:** This phase has moderate risk. Need simulation tests with 100+ rapid requests to verify rate cap is never exceeded. Unit tests alone insufficient; simulation with fake timers required.

---

### Phase 2: Filing Discovery & Normalization
**Rationale:** Once transport is solid, implement the core SEC EDGAR query flow. Normalization and deduplication must happen here; they're foundational for all downstream operations.

**Delivers:**
- `DiscoveryService` querying `data.sec.gov/submissions/CIK##########.json`
- JSON parsing and response handling
- Filing normalization (CIK padding to 10 digits, accession format `##########-##-######`, date format `YYYY-MM-DD`)
- Pagination support (handle `filings.files[]` array)
- Deduplication by `{cik}:{accessionNo}` identity key
- Stable sorting (filingDate ascending, accessionNo ascending)
- Form-type filtering (user-provided `formTypes[]`)
- Date-range filtering (user-provided `from`, `to`)

**Features addressed:**
- Filing discovery (table stakes)
- Form-type filtering (table stakes)
- Date-range filtering (table stakes)
- Deterministic normalization (table stakes)
- Pagination (differentiator)

**Pitfalls to avoid:**
- Pagination ignored (missing `filings.files[]`)
- Normalization not idempotent
- CIK padding inconsistent
- Accession format inconsistent

**Research flag:** Moderate risk. SEC API response format varies slightly across filing types. Need integration tests against real endpoints (10-K, 10-Q, 8-K, S-1). Pagination must be tested with large-filer CIK (50,000+ filings).

---

### Phase 3: Exhibit Enumeration & Contract Filtering
**Rationale:** Extends discovery to the exhibit level. Two closely related tasks: retrieving exhibit lists and filtering to EX-10* contracts. Format normalization for exhibit types is critical.

**Delivers:**
- `ExhibitService` for filing detail resolution
- HTML/XBRL parsing to extract exhibit lists
- Exhibit normalization (sequence, type, description, filename)
- Deduplication by `{accessionNo}:{sequence}` identity key
- Stable sorting (sequence ascending, filename ascending)
- `ContractExhibitFilter` for EX-10* matching
- Exhibit type normalization (handle `EX-10`, `EX_10`, `EX/10`, `EX-10.1`, `EX-10.01`, `EX-10A`, etc.)

**Features addressed:**
- Exhibit enumeration (table stakes)
- Contract exhibit filtering (table stakes)
- Contract-focused filtering (differentiator, handles format variants)

**Pitfalls to avoid:**
- Exhibit type not normalized before matching
- Deduplication logic (reuse from Phase 2)

**Research flag:** Moderate risk. SEC's filing detail pages vary in structure. Need integration tests against diverse filing types to understand HTML format. Exhibit type normalization rules are inferred from specification; need real-world validation.

---

### Phase 4: Exhibit Download & Integrity Verification
**Rationale:** Terminal operation—users need actual exhibit bytes. Hashing is straightforward but critical for integrity.

**Delivers:**
- `DownloadService` fetching exhibit bytes via `GET https://www.sec.gov/Archives/edgar/...`
- Response handling and error classification
- SHA-256 computation via `crypto.subtle.digest()`
- MIME type extraction (optional; may be undefined)
- Size capture
- Metadata collection (URL, MIME type, size, hash)

**Features addressed:**
- Exhibit download (table stakes)
- SHA-256 integrity verification (table stakes)

**Pitfalls to avoid:**
- MIME type missing (handle as undefined, not empty string)
- SHA-256 case inconsistency (always lowercase hex)
- Size calculation incorrect

**Research flag:** Low risk. Download is straightforward HTTP + hashing. NIST test vectors for SHA-256 validation are well-documented. Primarily engineering work.

---

### Phase 5: Error Handling & Integration
**Rationale:** Consolidate error handling, telemetry integration, and final testing. At this point, all business logic is complete; focus is on polish and observability.

**Delivers:**
- Complete error taxonomy with retryability metadata
- Integration tests across full stack (discovery → exhibit enumeration → filtering → download)
- Telemetry integration (hook up observability without forcing logging opinions)
- Performance profiling (verify bundle size < 20 KB gzip)
- Type safety validation (zero `any` types, `isolatedDeclarations: true`)
- Documentation and user-agent examples

**Features addressed:**
- Telemetry hooks (differentiator)
- All table stakes (verification across stack)

**Pitfalls to avoid:**
- None specific; phase consolidates work from earlier phases

**Research flag:** Low risk. Standard integration and testing work. No new external concerns introduced.

### Phase Ordering Rationale

This ordering is strict based on feature dependencies and risk mitigation:

- **Phase 1 must come first:** Rate limiting and timeout are foundational. No other phase can proceed without confidence in transport layer correctness.
- **Phase 2 must follow Phase 1:** Can't test filing discovery without working HTTP client. Normalization rules are foundational for all subsequent deduplication.
- **Phase 3 must follow Phase 2:** Exhibit service depends on successful filing discovery. Exhibit filtering depends on normalization patterns from Phase 2.
- **Phase 4 must follow Phase 3:** Download service depends on accurate exhibit references from Phase 3.
- **Phase 5 is final:** Integration and polish after all core features complete.

**Parallel work possible within phases** (e.g., DiscoveryService and normalization rules in Phase 2 can be designed in parallel), but cross-phase parallelism is not feasible due to dependencies.

### Research Flags

**Phases likely needing deeper research during planning:**

- **Phase 2 (Filing Discovery):** SEC API response format and pagination behavior need validation against diverse filing types and large filers. Integration testing during requirements phase is essential.
- **Phase 3 (Exhibit Enumeration):** Filing detail page structure and exhibit list HTML/XBRL formats vary. Recommend sampling real SEC responses for format analysis before implementation.

**Phases with standard patterns (skip deep research):**

- **Phase 1 (HTTP Transport):** Token bucket, AbortSignal, exponential backoff, and error classification are all well-documented, proven patterns. Implementation is straightforward.
- **Phase 4 (Download & Hashing):** SHA-256 via `crypto.subtle` is standard; no edge cases. Primarily engineering.
- **Phase 5 (Integration & Polish):** Standard testing and documentation work; no domain research needed.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| **Stack** | HIGH | All technologies verified with official docs (Node.js, Bun, SEC EDGAR, W3C Web Crypto). No speculation; all patterns production-proven. |
| **Features** | HIGH | Feature set directly from PRD and API contract docs. Table stakes vs. differentiators clearly defined. No ambiguity. |
| **Architecture** | HIGH | Layered, modular design is standard for HTTP clients. Component responsibilities clearly mapped. Pattern risks (rate limiting, retry placement) well-understood and preventable. |
| **Pitfalls** | HIGH | 13 pitfalls identified with concrete examples and prevention strategies. Most derived from common rate-limiting/normalization mistakes documented in industry best practices. User-agent and pagination issues specific to SEC EDGAR but well-documented. |

**Overall confidence:** HIGH

All four research dimensions (stack, features, architecture, pitfalls) are grounded in official documentation, established patterns, and SEC-specific knowledge. No external dependencies introduce speculation. Pitfalls are preventable with disciplined testing.

### Gaps to Address

1. **SEC API Response Format Variations** — Initial Phase 2 work should sample SEC responses across filing types (10-K, 10-Q, 8-K, S-1) to validate assumptions about field presence and format. Unlikely to reveal surprises but worth confirming.

2. **Filing Detail Page HTML Structure** — Phase 3 implementation will parse HTML/XBRL to extract exhibit lists. Recommend sampling 5-10 real filing detail pages before implementation to finalize parsing strategy (regex vs. DOM parsing).

3. **Exhibit Type Format Variance** — Specification allows `EX-10`, `EX_10`, `EX/10`, `EX-10.1`, `EX-10.01`, `EX-10A` as equivalent. Phase 3 should validate this assumption against real SEC filings (may find additional formats).

4. **MIME Type Availability** — Phase 4 should verify how often SEC omits MIME type headers on exhibit downloads. If common, may need fallback strategy (infer from filename extension).

5. **Rate Limiting Enforcement Mechanics** — Phase 1 should test actual SEC behavior under load. Specifically: Does SEC respond with HTTP 429 when rate limit exceeded, or silently drop requests? Testing against live endpoints (within reason) will clarify for observability.

## Sources

### Primary (HIGH confidence)

- **SEC.gov EDGAR APIs** — Official documentation: https://www.sec.gov/search-filings/edgar-application-programming-interfaces
- **data.sec.gov** — Live SEC API endpoint: https://data.sec.gov/
- **MDN: fetch API** — Web standard: https://developer.mozilla.org/en-US/docs/Web/API/fetch
- **MDN: AbortSignal.timeout()** — Web standard: https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static
- **MDN: SubtleCrypto.digest()** — Web standard: https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest
- **Node.js Fetch API (v18+)** — Native implementation: https://nodejs.org/api/fetch.html
- **W3C Web Crypto Standard** — Specification: https://www.w3.org/TR/WebCryptoAPI/

### Secondary (HIGH confidence, industry standards)

- **AWS: Exponential Backoff and Jitter** — Documented best practice: https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/
- **Token Bucket Algorithm** — Standard algorithm, multiple sources: https://codesignal.com/learn/courses/throttling-api-requests/

### Project specifications (HIGH confidence)

- `docs/edgar-ts-prd.md` — Product requirements
- `docs/edgar-ts-api-contract.md` — Locked API types
- `docs/edgar-ts-architecture.md` — Module design
- `docs/edgar-ts-sec-compliance.md` — SEC rate limits and requirements
- `docs/edgar-ts-error-retry.md` — Error taxonomy
- `docs/edgar-ts-data-model.md` — Normalization rules

---

**Research completed:** 2026-02-15
**Ready for roadmap:** YES
