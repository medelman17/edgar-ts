---
phase: 02-filing-discovery-normalization
plan: 03
subsystem: discovery
tags: [discovery-service, orchestration, filtering, integration, client-wiring]
dependency_graph:
  requires:
    - phase: 02-filing-discovery-normalization/01
      provides: [normalizeCik, normalizeAccession, normalizeFormType, validateDate, dedupeAndSort]
    - phase: 02-filing-discovery-normalization/02
      provides: [fetchAllFilings, SubmissionsResponse, FilingRecord]
    - phase: 01-http-transport-rate-limiting/03
      provides: [SecHttpClient]
  provides:
    - DiscoveryService orchestrator with complete filing discovery flow
    - EdgarClient.discoverFilings() fully functional method
    - Integration-tested discovery pipeline (validate → fetch → filter → normalize → dedupe → sort)
  affects: [03-exhibit-parsing, client-api]
tech_stack:
  added: []
  patterns:
    - Service orchestration pattern (delegates to specialized modules)
    - Default form type list includes amendments for comprehensive discovery
    - SEC viewer URL construction with compact accession numbers
key_files:
  created:
    - src/discovery/service.ts
    - tests/discovery/service.test.ts
  modified:
    - src/discovery/index.ts
    - src/client.ts
    - tests/client.test.ts
decisions:
  - decision: "Use ConfigurationError for CIK-less discovery (Daily Index not implemented)"
    rationale: "NotImplementedError doesn't exist in error taxonomy. ConfigurationError is closest semantic match for 'feature not yet supported'."
    status: applied
  - decision: "Default form types include amendments (/A variants)"
    rationale: "Amendments are separate submissions with distinct contract exhibits. Users typically want both original and amended filings for comprehensive discovery."
    status: applied
  - decision: "SEC viewer URL format for filing provenance"
    rationale: "Research recommends https://www.sec.gov/cgi-bin/viewer with compact accession. Provides direct access to filing viewer."
    status: applied
metrics:
  duration_seconds: 307
  tasks_completed: 2
  tests_added: 19
  completed_date: "2026-02-16T03:38:08Z"
---

# Phase 02 Plan 03: DiscoveryService Integration & Client Wiring

**DiscoveryService orchestrates complete filing discovery flow (validate → fetch → filter → normalize → dedupe → sort) and EdgarClient.discoverFilings() now fully functional with 19 integration tests**

## Summary

Implemented DiscoveryService orchestrator class that integrates normalization, pagination, and deduplication into a complete filing discovery pipeline. Wired DiscoveryService to EdgarClient.discoverFilings(), replacing the "Not yet implemented" stub. The discovery flow validates inputs (dates, CIK, form types), fetches filings via SEC Submissions API with pagination, filters by date range and form types, normalizes all fields to canonical format, deduplicates by identity key, and stable-sorts by filing date then accession number. All HTTP requests route through SecHttpClient for SEC-compliant rate limiting, retry, and timeout handling.

## Tasks Completed

### Task 1: Implement DiscoveryService orchestrator
- **Status:** Complete
- **Commit:** 5fe5e4d (combined with Task 2)
- **Duration:** ~180s
- **Files:**
  - Created: src/discovery/service.ts (143 lines)
  - Created: tests/discovery/service.test.ts (629 lines, 15 tests)
  - Modified: src/discovery/index.ts (export DiscoveryService)
- **Verification:** All 15 tests pass, typecheck clean, lint clean
- **Key deliverables:**
  - DiscoveryService class with discoverFilings(input: DiscoverFilingsInput) method
  - Input validation: dates (YYYY-MM-DD), from <= to, optional CIK normalization
  - Default form types: ["8-K", "10-K", "10-Q", "20-F", "S-1"] + amendments ("8-K/A", "10-K/A", etc.)
  - ConfigurationError when CIK not provided (Daily Index not yet implemented)
  - Date filtering: inclusive range [from, to] with ISO 8601 lexicographic comparison
  - Form type filtering: normalized uppercase comparison
  - FilingRef construction: normalized CIK (10-digit), accession (hyphenated), form type (uppercase)
  - Filing URL: SEC viewer format `https://www.sec.gov/cgi-bin/viewer?action=view&cik={cik}&accession_number={accessionCompact}&xbrl_type=v`
  - Delegates to fetchAllFilings (pagination), dedupeAndSort (identity-based dedup + stable sort)

### Task 2: Wire DiscoveryService to EdgarClient
- **Status:** Complete
- **Commit:** 5fe5e4d (combined with Task 1)
- **Duration:** ~127s
- **Files:**
  - Modified: src/client.ts (import SecHttpClient and DiscoveryService, add private fields, initialize in constructor, delegate discoverFilings)
  - Modified: tests/client.test.ts (add 4 integration tests, mock global fetch)
- **Verification:** All 190 tests pass (11 client + 179 from prior phases), typecheck clean
- **Key deliverables:**
  - EdgarClient now creates SecHttpClient instance in constructor
  - EdgarClient now creates DiscoveryService instance with httpClient
  - discoverFilings() delegates to discoveryService.discoverFilings()
  - Removed "Not yet implemented" stub
  - 4 client integration tests: CIK discovery, normalization, deduplication/sorting, custom form types

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed unused FilingRef import from service tests**
- **Found during:** Final lint check
- **Issue:** tests/discovery/service.test.ts imported FilingRef but didn't use it (tests use inline type assertions)
- **Fix:** Removed unused import
- **Files modified:** tests/discovery/service.test.ts
- **Verification:** Lint passes, all tests still pass
- **Committed in:** 5fe5e4d (amended to Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking lint issue)
**Impact on plan:** None - simple import cleanup, no functional changes.

## Test Coverage

**Total tests added:** 19 (15 DiscoveryService + 4 EdgarClient integration)

**DiscoveryService tests (15):**
- **Input validation (4):** Invalid from date, invalid to date, from > to, no CIK provided
- **Date range filtering (2):** Filings within/outside range, boundary dates (inclusive)
- **Form type filtering (3):** Default form types, custom form types, amendments in defaults
- **Normalization (3):** CIK padding, accession hyphenation, form type uppercase
- **Deduplication and sorting (2):** Duplicate removal, stable sort (date → accession)
- **Filing URL generation (1):** SEC viewer URL format

**EdgarClient integration tests (4):**
- Discovery by CIK and date range
- CIK normalization to 10-digit padded format
- Deduplication and stable sorting
- Custom form type filtering

All tests use mocked SecHttpClient (DiscoveryService tests) or mocked global fetch (EdgarClient tests).

## Key Decisions

### Decision 1: ConfigurationError for CIK-less discovery

**Context:** Plan specified throwing NotImplementedError when CIK not provided (Daily Index discovery not yet implemented).

**Issue:** NotImplementedError doesn't exist in the error taxonomy.

**Options:**
1. Add NotImplementedError to error taxonomy (requires modifying Phase 1 deliverable)
2. Use ConfigurationError with descriptive message
3. Use ValidationError

**Choice:** ConfigurationError (Option 2)

**Rationale:**
- ConfigurationError is semantically correct ("feature not configured/available")
- Avoids modifying completed Phase 1 error taxonomy
- Message clearly states "planned for future release"
- Non-retryable (correct behavior for missing feature)

### Decision 2: Default form types include amendments

**Context:** Plan specified default forms as "8-K, 10-K, 10-Q, 20-F, S-1 family".

**Interpretation:** Should defaults include amendments (10-K/A, 8-K/A, etc.)?

**Choice:** Yes, include amendments

**Rationale:**
- ROADMAP mentions "8-K, 10-K, 10-Q, 20-F, S-1 family" — amendments are part of each form family
- Plan explicitly notes "amendments are separate submissions with distinct contract exhibits"
- Users typically want comprehensive discovery (both original and amended filings)
- Aligns with edgar-ts goal of contract exhibit acquisition (amendments often contain updated exhibits)

### Decision 3: SEC viewer URL format

**Context:** Plan suggested two URL formats for filing provenance.

**Options:**
1. Browse-edgar: `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&...`
2. Viewer (simpler): `https://www.sec.gov/cgi-bin/viewer?action=view&cik={cik}&accession_number={accessionCompact}&xbrl_type=v`

**Choice:** Viewer format (Option 2)

**Rationale:**
- Plan research explicitly recommends viewer format
- Simpler URL construction (fewer parameters)
- Direct access to filing viewer (better UX)
- Uses compact accession (no hyphens) as per SEC API conventions

## Exported API

From `src/discovery/index.ts`:

**Classes:**
- `DiscoveryService` (new)

**Functions:**
- `normalizeCik`, `normalizeAccession`, `normalizeFormType`, `validateDate` (from Plan 01)
- `dedupeAndSort` (from Plan 01)
- `fetchAllFilings` (from Plan 02)

**Types:**
- `SubmissionsResponse`, `FilingRecord`, `PaginatedFileRef` (from Plan 02)

From `src/client.ts`:

**Classes:**
- `EdgarClient` (now fully functional for discovery)

**Methods:**
- `discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]>` — now delegates to DiscoveryService

## Integration Notes

**For Phase 3 (Exhibit Parsing):**
- FilingRef.filingUrl provides provenance for exhibit discovery
- FilingRef.accessionNo is identity key for exhibit queries
- FilingRef.formType can be used to filter filings before exhibit parsing

**For Phase 5 (Integration):**
- Consider telemetry hooks in DiscoveryService (emit metrics on deduplication counts, filter results)
- Consider exposing form type defaults as configurable option
- Daily Index integration will require new discovery path (separate from CIK-scoped Submissions API)

## Success Criteria Verification

- [x] User can discover filings by date range + CIK via EdgarClient.discoverFilings()
- [x] CIK filtering returns only matching filings (verified via 15 service tests)
- [x] Custom form-type filters override defaults correctly (tested)
- [x] Filing results normalized: CIK 10-digit padded, accession hyphenated, form uppercase (tested)
- [x] Duplicate filings deduplicated by (cik, accessionNo) identity (tested)
- [x] Filings sorted stably: filingDate asc, accessionNo asc (tested)
- [x] Source provenance URLs preserved in FilingRef.filingUrl (verified via URL generation test)
- [x] All discovery tests pass (190 total: 63 prior + 127 new across normalization, dedup, pagination, service, client)

## Performance

- **Duration:** 307s (~5.1 minutes)
- **Started:** 2026-02-16T03:33:01Z
- **Completed:** 2026-02-16T03:38:08Z
- **Tasks:** 2 (combined into 1 commit)
- **Files modified:** 5

## Self-Check

Running self-check to verify deliverables...

**Files created:**
- ✓ FOUND: src/discovery/service.ts
- ✓ FOUND: tests/discovery/service.test.ts

**Files modified:**
- ✓ FOUND: src/discovery/index.ts
- ✓ FOUND: src/client.ts
- ✓ FOUND: tests/client.test.ts

**Commits exist:**
- ✓ FOUND: 5fe5e4d (Tasks 1 & 2 combined)

**Tests pass:**
- ✓ 190 tests pass (15 service + 4 client + 171 from prior phases)
- ✓ Typecheck clean
- ✓ Lint clean (3 pre-existing warnings in timeout.test.ts from Phase 1)

**Exports verified:**
- ✓ DiscoveryService exported from src/discovery/index.ts
- ✓ EdgarClient.discoverFilings() functional (no longer throws "Not yet implemented")

## Self-Check: PASSED

All deliverables verified. Plan 02-03 complete.

---
*Phase: 02-filing-discovery-normalization*
*Completed: 2026-02-16T03:38:08Z*
