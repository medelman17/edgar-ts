# Requirements: edgar-ts

**Defined:** 2026-02-15
**Core Value:** Reliable, automatable access to SEC EDGAR contract exhibits with deterministic output and SEC-compliant request behavior.

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### HTTP Transport

- [ ] **HTTP-01**: Library enforces mandatory user-agent header on all SEC requests
- [ ] **HTTP-02**: Library rate-limits requests via token-bucket algorithm (default 8 req/s)
- [ ] **HTTP-03**: Library retries retryable failures with exponential backoff and full jitter (default 3 attempts, 250ms base, 4s max)
- [ ] **HTTP-04**: Library enforces per-request timeout with AbortSignal (default 10s)
- [ ] **HTTP-05**: Library supports request cancellation via caller-provided AbortSignal
- [ ] **HTTP-06**: Library classifies errors into typed categories with retryability flags
- [ ] **HTTP-07**: Library provides configurable rate limit, timeout, and retry options via constructor

### Filing Discovery

- [ ] **DISC-01**: User can discover filings by date range (from/to)
- [ ] **DISC-02**: User can optionally scope discovery by CIK
- [ ] **DISC-03**: User can optionally override form-type filter (defaults to 8-K, 10-K, 10-Q, 20-F, S-1 family)
- [ ] **DISC-04**: Library normalizes CIK to 10-digit zero-padded format
- [ ] **DISC-05**: Library normalizes accession numbers to canonical hyphenated format
- [ ] **DISC-06**: Library deduplicates filings by (CIK, accessionNo) identity
- [ ] **DISC-07**: Library sorts filings deterministically (filingDate asc, accessionNo asc)
- [ ] **DISC-08**: Library preserves source provenance URLs in FilingRef results

### Exhibit Enumeration

- [ ] **EXHB-01**: User can list all exhibits for a given filing
- [ ] **EXHB-02**: Library extracts exhibit type, description, filename, sequence, and URL from filing index
- [ ] **EXHB-03**: Library normalizes and deduplicates exhibits by (accessionNo, sequence) identity
- [ ] **EXHB-04**: Library sorts exhibits deterministically (sequence asc, filename asc)
- [ ] **EXHB-05**: Library preserves exhibit provenance URLs

### Contract Filtering

- [ ] **CNTR-01**: User can list only contract exhibits (EX-10*) for a given filing
- [ ] **CNTR-02**: Library matches EX-10 variants including dotted forms (EX-10.1, EX-10.2) and format variations

### Download

- [ ] **DNLD-01**: User can download raw exhibit bytes for a given exhibit
- [ ] **DNLD-02**: Library computes and returns SHA-256 hex digest for downloaded bytes
- [ ] **DNLD-03**: Library returns file size in bytes
- [ ] **DNLD-04**: Library returns MIME type hint from response headers

### Observability

- [ ] **OBSV-01**: Library provides optional telemetry hooks (onRequestStart, onRequestEnd, onRetry)
- [ ] **OBSV-02**: Library errors carry structured metadata (statusCode, URL, attempt count)

### Type Safety

- [ ] **TYPE-01**: Library exports TypeScript types for all public inputs and outputs
- [ ] **TYPE-02**: Library uses isolatedDeclarations-compatible explicit type annotations on all exports

### Release

- [ ] **RLSE-01**: API documentation includes copy-paste example for each public method
- [ ] **RLSE-02**: Library passes test suite on Node 18, 20, 22 and Bun
- [ ] **RLSE-03**: Library maintains bundle size under 20 KB
- [ ] **RLSE-04**: Release includes changelog entry and semver version tag

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Extended Discovery

- **DISC-09**: User can search filings by keyword via EFTS full-text search
- **DISC-10**: Library auto-paginates large filing result sets (>1000 filings per CIK)

### Extended Exhibits

- **EXHB-06**: User can filter exhibits by arbitrary type pattern (not just EX-10*)
- **EXHB-07**: Library handles multiple filing index formats (JSON, HTML, XML) with fallback

### Resilience

- **RSLC-01**: Library provides circuit breaker for sustained failures
- **RSLC-02**: Library supports request-level retry budget sharing across concurrent operations

## Out of Scope

| Feature | Reason |
|---------|--------|
| Document parsing, OCR, text extraction | Library returns raw bytes only; parsing is consumer responsibility |
| XBRL or financial statement analysis | Not in mission scope; separate domain |
| Browser runtime support | Node + Bun only; SEC requests require server-side user-agent |
| Built-in persistence/storage | Storage-agnostic by design; consumers handle persistence |
| CLI or UI tooling | Library-only deliverable |
| Multi-registry support | Single-source focus on SEC EDGAR |
| Batch/bulk operations | Consumer orchestrates concurrency; library is per-request |
| Response caching layer | Consumer responsibility; library is stateless |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| HTTP-01 | 1 | Pending |
| HTTP-02 | 1 | Pending |
| HTTP-03 | 1 | Pending |
| HTTP-04 | 1 | Pending |
| HTTP-05 | 1 | Pending |
| HTTP-06 | 1 | Pending |
| HTTP-07 | 1 | Pending |
| DISC-01 | 2 | Pending |
| DISC-02 | 2 | Pending |
| DISC-03 | 2 | Pending |
| DISC-04 | 2 | Pending |
| DISC-05 | 2 | Pending |
| DISC-06 | 2 | Pending |
| DISC-07 | 2 | Pending |
| DISC-08 | 2 | Pending |
| EXHB-01 | 3 | Pending |
| EXHB-02 | 3 | Pending |
| EXHB-03 | 3 | Pending |
| EXHB-04 | 3 | Pending |
| EXHB-05 | 3 | Pending |
| CNTR-01 | 3 | Pending |
| CNTR-02 | 3 | Pending |
| DNLD-01 | 4 | Pending |
| DNLD-02 | 4 | Pending |
| DNLD-03 | 4 | Pending |
| DNLD-04 | 4 | Pending |
| OBSV-01 | 1 | Pending |
| OBSV-02 | 1 | Pending |
| TYPE-01 | 5 | Pending |
| TYPE-02 | 5 | Pending |
| RLSE-01 | 5 | Pending |
| RLSE-02 | 5 | Pending |
| RLSE-03 | 5 | Pending |
| RLSE-04 | 5 | Pending |

**Coverage:**
- v1 requirements: 34 total
- Mapped to phases: 34 ✓
- Unmapped: 0 ✓

---

*Requirements defined: 2026-02-15*
*Roadmap traceability: 2026-02-15*
