# edgar-ts Roadmap

**Project:** TypeScript library for SEC EDGAR filing discovery and contract exhibit acquisition

**Core Value:** Reliable, automatable access to SEC EDGAR contract exhibits with deterministic output and SEC-compliant request behavior.

**Depth:** Quick (3-5 phases)

**Total v1 Requirements:** 34

**Mapped Requirements:** 34/34 (100% coverage)

---

## Phases

- [ ] **Phase 1: HTTP Transport & Rate Limiting** - Foundation: SecHttpClient with rate limiting, retry, timeout, error classification, user-agent validation
- [ ] **Phase 2: Filing Discovery & Normalization** - Core query flow with pagination, normalization, deduplication, and sorting
- [ ] **Phase 3: Exhibit Enumeration & Contract Filtering** - Exhibit listing with EX-10* filtering and format normalization
- [ ] **Phase 4: Exhibit Download & Integrity Verification** - Download service with SHA-256 hashing and metadata capture
- [ ] **Phase 5: Integration, Testing & Release** - Integration tests, documentation, runtime parity, and release readiness

---

## Phase Details

### Phase 1: HTTP Transport & Rate Limiting

**Goal:** Establish SEC-compliant HTTP transport layer with rate limiting, retry logic, and typed error handling as foundation for all downstream operations.

**Depends on:** Nothing (first phase; Phase 0 repo bootstrap already complete)

**Requirements:** HTTP-01, HTTP-02, HTTP-03, HTTP-04, HTTP-05, HTTP-06, HTTP-07, OBSV-01, OBSV-02

**Success Criteria** (what must be TRUE):
1. Library enforces mandatory user-agent header; rejects empty/placeholder agents on construction
2. Requests are rate-limited at 8 req/s default (configurable); no burst exceeds configured rate under rapid fire (100+ request test)
3. Retryable failures retry with exponential backoff (250ms base, 4s max, 3 attempts) and full jitter; non-retryable failures fail immediately
4. Per-request timeouts enforce 10s default (configurable) via AbortSignal; exceeded timeouts surface as TimeoutError
5. Caller-provided AbortSignal triggers request cancellation; cancellations surface as typed errors
6. Errors are classified into typed categories (ConfigurationError, ValidationError, TransportError, RateLimitedError, TimeoutError, NotFoundError, ParseError) with retryable flags
7. Telemetry hooks (onRequestStart, onRequestEnd, onRetry) fire with structured event data without forcing logging opinions

**Plans:**
- [ ] 01-01-PLAN.md — TokenBucket limiter + timeout/abort wrapper (Wave 1)
- [ ] 01-02-PLAN.md — Exponential backoff + error mapper (Wave 2)
- [ ] 01-03-PLAN.md — SecHttpClient orchestrator + integration tests (Wave 3)

---

### Phase 2: Filing Discovery & Normalization

**Goal:** Implement core SEC EDGAR filing query flow with deterministic normalization, deduplication, and pagination as foundation for exhibit operations.

**Depends on:** Phase 1 (rate-limited HTTP client required)

**Requirements:** DISC-01, DISC-02, DISC-03, DISC-04, DISC-05, DISC-06, DISC-07, DISC-08

**Success Criteria** (what must be TRUE):
1. User can discover filings by date range (from/to) across entire SEC database; filtering works for single-date and multi-month ranges
2. User can optionally scope discovery to specific CIK(s); CIK filtering returns only matching filings
3. User can override default form-type filter (8-K, 10-K, 10-Q, 20-F, S-1 family); custom filters applied correctly
4. Filing results are normalized deterministically: CIK padded to 10 digits zero-filled, accession format canonical (##########-##-######), dates ISO 8601
5. Duplicate filings by (cik, accessionNo) identity are deduplicated; result count never exceeds unique filing count
6. Filings are sorted stably: filingDate ascending, then accessionNo ascending; sorting deterministic across multiple invocations
7. Source provenance URLs preserved in FilingRef; consumers can access original EDGAR URLs
8. Large filing lists (1000+ filings per CIK) are paginated transparently; user sees complete result without truncation

**Plans:** 3 plans in 2 waves

Plans:
- [ ] 02-01-PLAN.md — Normalization & deduplication foundations (Wave 1)
- [ ] 02-02-PLAN.md — Submissions API pagination (Wave 1)
- [ ] 02-03-PLAN.md — DiscoveryService orchestration & EdgarClient integration (Wave 2)

---

### Phase 3: Exhibit Enumeration & Contract Filtering

**Goal:** Extend discovery to exhibit level with deterministic normalization and specialized contract-exhibit filtering (EX-10* only).

**Depends on:** Phase 2 (filing discovery required to enumerate exhibits)

**Requirements:** EXHB-01, EXHB-02, EXHB-03, EXHB-04, EXHB-05, CNTR-01, CNTR-02

**Success Criteria** (what must be TRUE):
1. User can list all exhibits for a given filing; response includes sequence, type, description, filename, and EDGAR URL for each exhibit
2. Exhibit extraction handles SEC filing index format variants (HTML, XBRL); all exhibit metadata parsed correctly
3. Exhibits are deduplicated by (accessionNo, sequence) identity; no duplicate sequence numbers within filing
4. Exhibits are sorted stably: sequence ascending, then filename ascending; sorting deterministic across multiple invocations
5. User can list only contract exhibits (EX-10*) for a filing; filtering matches all EX-10 variants (EX-10, EX-10.1, EX-10.2, EX-10A, etc.)
6. Contract exhibit type normalization handles dotted (EX-10.1), format variations (EX_10, EX/10, EX-10A); all variants match correctly
7. Exhibit provenance URLs preserved in ExhibitRef; consumers can access original EDGAR URLs

**Plans:** TBD

---

### Phase 4: Exhibit Download & Integrity Verification

**Goal:** Implement exhibit download with raw byte retrieval, SHA-256 integrity verification, and metadata capture.

**Depends on:** Phase 3 (accurate exhibit metadata required for download URLs)

**Requirements:** DNLD-01, DNLD-02, DNLD-03, DNLD-04

**Success Criteria** (what must be TRUE):
1. User can download raw exhibit bytes for any ExhibitRef; bytes retrieved exactly as served by SEC (no transformation)
2. SHA-256 integrity hash computed for downloaded bytes; hash format lowercase hexadecimal, consistent with NIST test vectors
3. File size in bytes captured and returned; size matches actual downloaded byte count
4. MIME type hint extracted from response headers; optional (may be undefined if not provided by SEC)
5. DownloadedExhibit metadata complete: includes ExhibitRef, bytes, size, optional MIME type, and SHA-256 digest

**Plans:** TBD

---

### Phase 5: Integration, Testing & Release

**Goal:** Consolidate full-stack functionality with comprehensive integration tests, documentation, runtime parity validation, and release readiness.

**Depends on:** Phases 1-4 (all core features complete before integration)

**Requirements:** TYPE-01, TYPE-02, RLSE-01, RLSE-02, RLSE-03, RLSE-04

**Success Criteria** (what must be TRUE):
1. All public inputs and outputs have exported TypeScript types (EdgarClientOptions, FilingRef, ExhibitRef, DownloadedExhibit, etc.); no implicit `any` types
2. All type exports use isolatedDeclarations-compatible explicit type annotations; no inferred types
3. API documentation includes copy-paste examples for each public method (discoverFilings, listExhibits, listContractExhibits, downloadExhibit)
4. Test suite passes on Node.js 18, 20, 22 and Bun; no runtime-specific code paths break compatibility
5. Bundle size remains under 20 KB gzip limit; size-limit CI check passes
6. Release includes changelog entry via changesets and semver version tag; traceability matrix maps requirements to implementation

**Plans:** TBD

---

## Progress Table

| Phase | Name | Plans Complete | Status | Completed |
|-------|------|----------------|--------|-----------|
| 1 | HTTP Transport & Rate Limiting | 3/3 | Planned | — |
| 2 | Filing Discovery & Normalization | 0/3 | Planned | — |
| 3 | Exhibit Enumeration & Contract Filtering | 0/3 | Not started | — |
| 4 | Exhibit Download & Integrity Verification | 0/2 | Not started | — |
| 5 | Integration, Testing & Release | 0/2 | Not started | — |

---

## Coverage Summary

**Total v1 requirements:** 34

**Requirements by phase:**
- Phase 1 (HTTP Transport): 9 requirements (HTTP-01–07, OBSV-01–02)
- Phase 2 (Filing Discovery): 8 requirements (DISC-01–08)
- Phase 3 (Exhibit Enumeration): 7 requirements (EXHB-01–05, CNTR-01–02)
- Phase 4 (Download): 4 requirements (DNLD-01–04)
- Phase 5 (Integration/Release): 6 requirements (TYPE-01–02, RLSE-01–04)

**Coverage:** 34/34 ✓ (100% — no orphaned requirements)

---

**Last updated:** 2026-02-15 (Phase 1 planning complete)
