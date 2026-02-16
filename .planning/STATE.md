# Project State: edgar-ts

**Project:** edgar-ts — TypeScript library for SEC EDGAR filing discovery and contract exhibit acquisition

**Last Updated:** 2026-02-16 (Phase 3 Plan 01 complete)

---

## Project Reference

**Core Value:** Reliable, automatable access to SEC EDGAR contract exhibits with deterministic output and SEC-compliant request behavior.

**Stack:** TypeScript 5.9 on Node.js 18+ / Bun, zero runtime dependencies, native web-standard APIs only.

**Key Constraints:**
- SEC compliance: mandatory user-agent, 8 req/s default rate limit, exponential backoff retry
- Deterministic: canonical normalization, stable sorting, deduplication
- Zero deps: no external packages; inline implementations of token bucket, retry logic
- Node + Bun parity: fetch, AbortSignal, crypto.subtle only

---

## Current Position

**Current Phase:** 03

**Current Plan:** 02 (Not started)

**Phase 1 Progress (Complete):**
- Plan 01 (Rate limiting & timeout foundations) ✓ Complete
- Plan 02 (Retry policy & error mapper) ✓ Complete
- Plan 03 (SecHttpClient integration) ✓ Complete

**Phase 2 Progress (Complete):**
- Plan 01 (Normalization & deduplication foundations) ✓ Complete
- Plan 02 (SEC Submissions API pagination) ✓ Complete
- Plan 03 (DiscoveryService integration & client wiring) ✓ Complete

**Phase 3 Progress:**
- Plan 01 (Exhibit parsing & normalization) ✓ Complete
- Plan 02 (ExhibitService integration) — Not started
- Plan 03 (Contract filtering & client wiring) — Not started

**Phase 1 Completed:**
- TokenBucket rate limiter with 1-10 req/s bounds
- Timeout/abort signal composition with Node 18/20 polyfill
- Exponential backoff with full jitter (AWS best practice)
- HTTP status → typed error classification with retryability flags
- SecHttpClient orchestrator combining all HTTP transport concerns
- 108 passing tests (92 HTTP module + 16 general)

**Phase 2 Completed:**
- normalizeCik: zero-pad to 10 digits, validate range, idempotent
- normalizeAccession: canonical ##########-##-###### format
- normalizeFormType: uppercase with slash preservation
- validateDate: YYYY-MM-DD validation with rollover detection
- dedupeAndSort: identity-based dedup with stable sort
- fetchAllFilings: recursive pagination through SEC filings.files array
- SubmissionsResponse and FilingRecord types for SEC API structure
- DiscoveryService: complete orchestration flow (validate → fetch → filter → normalize → dedupe → sort)
- EdgarClient.discoverFilings() fully functional with delegation to DiscoveryService
- 82 new tests (35 normalization + 11 deduplication + 17 pagination + 15 service + 4 client integration)

**Phase 3 Plan 01 Completed:**
- parseExhibitTableFromHtml: custom HTML table parsing without DOMParser (Node 18+ compatible)
- normalizeSequence: numeric validation, preserves leading zeros for identity uniqueness
- normalizeExhibitType: separator normalization (_, /, -) to canonical hyphenated format
- normalizeDescription: converts empty/whitespace to undefined
- RawExhibit type for intermediate parsing results
- 63 new tests (21 parsing + 42 normalization) covering all format variants and edge cases

---

## Performance Metrics

| Metric | Value | Target |
|--------|-------|--------|
| Total v1 requirements | 34 | 34 ✓ |
| Phases | 5 | 3-5 (quick depth) ✓ |
| Requirements mapped | 34 | 100% ✓ |
| Success criteria per phase | 3-7 | 2-5 ✓ |
| Dependencies | Linear (1→2→3→4→5) | All phases dependent on previous ✓ |

**Execution Metrics:**

| Phase | Plan | Duration | Tasks | Files | Status |
|-------|------|----------|-------|-------|--------|
| 01-http-transport-rate-limiting | 01 | 514s | 2 | 4 | ✓ Complete |
| 01-http-transport-rate-limiting | 02 | 185s | 2 | 4 | ✓ Complete |
| 01-http-transport-rate-limiting | 03 | 444s | 2 | 3 | ✓ Complete |
| 02-filing-discovery-normalization | 01 | 237s | 2 | 5 | ✓ Complete |
| 02-filing-discovery-normalization | 02 | 413s | 1 | 5 | ✓ Complete |
| 02-filing-discovery-normalization | 03 | 307s | 2 | 5 | ✓ Complete |
| 03-exhibit-enumeration-contract-filtering | 01 | 230s | 2 | 5 | ✓ Complete |

## Accumulated Context

### Key Decisions

| Decision | Rationale | Status |
|----------|-----------|--------|
| Phase structure derived from research findings | Research identified 5 natural delivery phases with proven patterns | ✓ Applied |
| Phase 1 foundation-first approach | Rate limiting, timeout, error handling must be correct before business logic | ✓ Aligned with research |
| Normalization centralized in Phase 2 | Deduplication and sorting patterns reused across all downstream phases | ✓ Efficient |
| Phase 5 integration-focused | All core features complete in Phases 1-4; Phase 5 consolidates tests, docs, release | ✓ Clean separation |
| Promise chain for TokenBucket fairness | Sequential processing without race conditions; works with fake timers | ✓ Applied (Phase 1 Plan 01) |
| Inline combineSignals polyfill | Node 18/20 compatibility without dependencies | ✓ Applied (Phase 1 Plan 01) |
| Full jitter formula for retry backoff | AWS best practice prevents thundering herd; uniform distribution verified | ✓ Applied (Phase 1 Plan 02) |
| HTTP status classification (5xx/429/408 retryable) | Aligns with HTTP spec semantics; maximizes retry efficiency | ✓ Applied (Phase 1 Plan 02) |
| Inline timeout/abort logic in SecHttpClient | Enables headers passthrough for SEC user-agent compliance; preserves Plan 01 deliverables | ✓ Applied (Phase 1 Plan 03) |
| Retry loop driven by error.retryable flags | Single source of truth from error-mapper; orchestrator independent of HTTP semantics | ✓ Applied (Phase 1 Plan 03) |
| Date rollover detection for validateDate | JavaScript Date constructor is lenient; compare ISO output to detect invalid dates | ✓ Applied (Phase 2 Plan 01) |
| Deduplication assumes normalized inputs | dedupeAndSort does NOT normalize internally; prevents double-normalization | ✓ Applied (Phase 2 Plan 01) |
| Stable sort via localeCompare | ISO 8601 dates are lexicographically sortable; no Date parsing in comparator | ✓ Applied (Phase 2 Plan 01) |
| Paginated files use www.sec.gov base URL | Research findings indicate paginated files differ from primary endpoint base | ✓ Applied (Phase 2 Plan 02) |
| Parse both direct and parallel array formats | SEC paginated responses may vary in structure; support both for flexibility | ✓ Applied (Phase 2 Plan 02) |
| Unknown intermediate casting for type narrowing | SecHttpClient response lacks json() method; cast to unknown then narrow to avoid any | ✓ Applied (Phase 2 Plan 02) |
| ConfigurationError for CIK-less discovery | NotImplementedError doesn't exist in taxonomy; ConfigurationError semantically correct for "feature not yet supported" | ✓ Applied (Phase 2 Plan 03) |
| Default form types include amendments | Amendments are separate submissions with distinct exhibits; users want comprehensive discovery | ✓ Applied (Phase 2 Plan 03) |
| SEC viewer URL format for filing provenance | Research recommends viewer format with compact accession; provides direct filing access | ✓ Applied (Phase 2 Plan 03) |
| Custom HTML parsing without DOMParser | DOMParser not available in Node 18+; regex-based parsing maintains zero-dep requirement | ✓ Applied (Phase 3 Plan 01) |
| Preserve leading zeros in exhibit sequence | Filing tables may contain both "1" and "001" as distinct sequences; preservation ensures identity uniqueness | ✓ Applied (Phase 3 Plan 01) |
| Separator normalization to hyphen | SEC types use _, /, - separators; canonical hyphenated format aligns with EDGAR documentation | ✓ Applied (Phase 3 Plan 01) |

### Architecture Highlights

- **Layered facade:** EdgarClient delegates to specialized internal modules (Discovery, Exhibit, Download, Telemetry)
- **Centralized transport:** SecHttpClient owns rate limiting, timeout, retry, telemetry — no service can bypass
- **Typed errors:** Error hierarchy with retryable flags enables orchestrator-level retry decisions
- **Deterministic data:** All discovery/exhibit operations deduplicate by identity key and sort stably
- **Web-standard APIs:** fetch, AbortSignal, crypto.subtle — no polyfills needed for Node 18+ / Bun

### Critical Pitfalls (from Research)

1. **Rate limiting not applied globally** — Prevent by implementing rate limiting in SecHttpClient before all fetch() calls; simulate 100+ rapid requests in tests
2. **Token bucket capacity exceeds refill rate** — Always ensure capacity ≤ refillRate (e.g., TokenBucket(8, 8) for 8 req/s)
3. **Retry escapes rate limiter** — Implement retry only in SecHttpClient; all fetch() calls must go through it
4. **Normalization not idempotent** — Test normalize(normalize(data)) === normalize(data) for 5+ iterations
5. **Pagination ignored** — Implement DiscoveryService to iterate filings.files[] array; test against large-filer CIKs (BRK.B, JPM, MSFT)

### Test Strategy

- **Phase 1:** Simulation tests (fake timers) with 100+ rapid requests to verify rate cap never exceeded
- **Phase 2:** Integration tests against real SEC endpoints (10-K, 10-Q, 8-K, S-1); large-filer CIK pagination validation
- **Phase 3:** Diverse filing types to validate HTML/XBRL parsing; exhibit type normalization edge cases
- **Phase 4:** SHA-256 NIST test vectors; MIME type availability validation
- **Phase 5:** Full-stack integration (discovery → exhibit → filter → download); Node 18/20/22 + Bun matrix

---

## Session Continuity

**Handoff to `/gsd:plan-phase 1`:**

When planning Phase 1, refer to:
- `.planning/ROADMAP.md` — Phase 1 goal, success criteria, requirements
- `.planning/research/SUMMARY.md` — Phase 1 pitfalls, stack recommendations, test strategy
- `docs/edgar-ts-architecture.md` — Component design, data flow
- `docs/edgar-ts-error-retry.md` — Error taxonomy, retry policy
- `docs/edgar-ts-sec-compliance.md` — Rate limits, user-agent requirements

**Critical Phase 1 responsibilities:**
- Implement SecHttpClient with token-bucket rate limiting (default 8 req/s, configurable)
- Implement exponential backoff with jitter (250ms base, 4s max, 3 attempts)
- Implement AbortSignal-based timeout (default 10s, configurable)
- Implement user-agent validation (reject empty/placeholder)
- Implement typed error classification with retryable flags
- Write simulation tests (fake timers) with 100+ concurrent requests to verify rate cap
- Wire telemetry hooks (onRequestStart, onRequestEnd, onRetry) without forcing logging

**Phase 1 success:** SecHttpClient passes all tests; rate limiting verified under load; retry logic deterministic; errors typed with correct retryability.

---

**Last Session:**
- Stopped at: Completed Phase 3 Plan 01 (HTML Parsing & Normalization Foundations) - 2 tasks, 63 tests, 230s
- Timestamp: 2026-02-16T04:11:02Z
- Next action: Phase 3 Plan 02 (ExhibitService integration & client wiring)
