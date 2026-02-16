---
phase: 03-exhibit-enumeration-contract-filtering
plan: 03
subsystem: exhibits
tags: [exhibit-service, orchestration, integration, client-wiring]
dependency_graph:
  requires:
    - phase: 03-exhibit-enumeration-contract-filtering/01
      provides: [parseExhibitTableFromHtml, normalizeSequence, normalizeExhibitType, normalizeDescription, RawExhibit]
    - phase: 03-exhibit-enumeration-contract-filtering/02
      provides: [dedupeAndSortExhibits, isContractExhibit]
    - phase: 01-http-transport-rate-limiting/03
      provides: [SecHttpClient]
  provides:
    - ExhibitService orchestrator with complete exhibit enumeration flow
    - EdgarClient.listExhibits() fully functional method
    - EdgarClient.listContractExhibits() fully functional method
    - Integration-tested exhibit pipeline (fetch → parse → normalize → dedupe → sort → filter)
  affects: [04-download-service, client-api]
tech_stack:
  added: []
  patterns:
    - Service orchestration pattern (delegates to specialized modules)
    - SEC archive URL construction with compact accession numbers
    - Filing-local exhibit enumeration (no cross-filing queries)
key_files:
  created:
    - src/exhibits/service.ts
    - tests/exhibits/service.test.ts
  modified:
    - src/exhibits/index.ts
    - src/client.ts
    - tests/client.test.ts
decisions:
  - decision: "Cast SecHttpClient response to unknown then text() method"
    rationale: "HttpResponse type in SecHttpClient only includes ok and status properties. Phase 2 pattern uses unknown casting for json() - same approach for text()."
    status: applied
  - decision: "ExhibitService orchestrates same flow as DiscoveryService"
    rationale: "Mirror Phase 2 Plan 03 pattern: service class with httpClient dependency, public methods delegate to internal modules, client delegates to service."
    status: applied
  - decision: "SEC archive URLs use compact accession format"
    rationale: "Filing index and exhibit URLs require accession without hyphens (000119312520123456 vs 0001193125-20-123456). Matches SEC API conventions."
    status: applied
metrics:
  duration_seconds: 259
  tasks_completed: 2
  tests_added: 25
  completed_date: "2026-02-16T04:18:48Z"
---

# Phase 03 Plan 03: ExhibitService Integration & Client Wiring Summary

**ExhibitService orchestrates complete exhibit enumeration flow (fetch → parse → normalize → dedupe → sort) and EdgarClient.listExhibits()/listContractExhibits() now fully functional with 25 integration tests**

## Summary

Implemented ExhibitService orchestrator class that integrates exhibit parsing, normalization, deduplication, and contract filtering into a complete exhibit enumeration pipeline. Wired ExhibitService to EdgarClient.listExhibits() and listContractExhibits(), replacing the "Not yet implemented" stubs. The exhibit flow fetches filing index HTML from SEC archive, parses exhibit table, normalizes fields to canonical format, deduplicates by filing-local identity, stable-sorts by numeric sequence, and filters to EX-10* contracts. All HTTP requests route through SecHttpClient for SEC-compliant rate limiting, retry, and timeout handling.

## Tasks Completed

### Task 1: Implement ExhibitService orchestrator
- **Status:** Complete
- **Commit:** 5f820b6
- **Duration:** ~180s
- **Files:**
  - Created: src/exhibits/service.ts (145 lines)
  - Created: tests/exhibits/service.test.ts (561 lines, 19 tests)
  - Modified: src/exhibits/index.ts (export ExhibitService)
- **Verification:** All 19 tests pass, typecheck clean, lint clean
- **Key deliverables:**
  - ExhibitService class with constructor accepting SecHttpClient
  - buildFilingIndexUrl(cik, accessionNo): constructs SEC archive index URL with compact accession
  - buildExhibitUrl(cik, accessionNo, filename): constructs exhibit URL preserving provenance
  - listExhibits(filing): orchestrates fetch → parse → normalize → dedupe → sort flow
  - listContractExhibits(filing): delegates to listExhibits and filters EX-10* exhibits
  - 19 service tests covering URL construction, parsing, normalization, filtering, deduplication, sorting

### Task 2: Wire ExhibitService to EdgarClient
- **Status:** Complete
- **Commit:** e2fd55a
- **Duration:** ~79s
- **Files:**
  - Modified: src/client.ts (import ExhibitService, add private field, initialize in constructor, delegate methods)
  - Modified: tests/client.test.ts (add 6 integration tests, mock global fetch)
- **Verification:** All 325 tests pass (17 client + 308 from prior phases), typecheck clean
- **Key deliverables:**
  - EdgarClient now creates ExhibitService instance with httpClient in constructor
  - listExhibits() delegates to exhibitService.listExhibits()
  - listContractExhibits() delegates to exhibitService.listContractExhibits()
  - Removed "Not yet implemented" stubs from both methods
  - 6 client integration tests: listExhibits (3 tests), listContractExhibits (3 tests)

## Deviations from Plan

None — plan executed exactly as written.

All tasks completed as specified:
- ExhibitService follows Phase 2 DiscoveryService orchestration pattern
- URL construction uses compact accession format (hyphens removed)
- Client delegation mirrors Phase 2 Plan 03 wiring pattern
- Test coverage exceeds minimums (19 service + 6 client = 25 total tests)

## Test Coverage

**Total tests added:** 25 (19 ExhibitService + 6 EdgarClient integration)

**ExhibitService tests (19):**
- **URL construction (3 tests):**
  - Filing index URL with compact accession
  - Exhibit URLs with compact accession and filename
  - CIK and accession formatting preservation

- **listExhibits (9 tests):**
  - Empty array when no exhibits
  - Single exhibit with all fields mapped
  - Multiple exhibits (3+ rows)
  - Exhibit type normalization (EX_10 → EX-10)
  - Sequence normalization (whitespace trimmed)
  - Description normalization (empty → undefined)
  - Deduplication by (accessionNo, sequence) identity
  - Numeric sequence sorting (10 after 2)
  - Filename secondary sort
  - Exhibit URL construction

- **listContractExhibits (6 tests):**
  - Filter to only EX-10* exhibits
  - Empty array when no contracts
  - All EX-10 variants included (EX-10, EX-10.1, EX-10A)
  - Non-contract exhibits excluded (EX-21, EX-99)
  - Deduplication and sorting preserved
  - Delegation to listExhibits verified

**EdgarClient integration tests (6):**
- **listExhibits (3 tests):**
  - Lists all exhibits with count and field verification
  - Normalizes exhibit types
  - Deduplicates and sorts correctly

- **listContractExhibits (3 tests):**
  - Filters to only EX-10* exhibits
  - Returns empty array when no contracts
  - Includes all EX-10 variants

All tests use mocked SecHttpClient (service tests) or mocked global fetch (client tests).

## Key Decisions

### Decision 1: Cast SecHttpClient response to unknown then text() method

**Context:** HttpResponse type in SecHttpClient only includes `ok` and `status` properties (no `text()` method).

**Issue:** ExhibitService needs to call `response.text()` to get HTML content.

**Options:**
1. Modify HttpResponse type in SecHttpClient (requires changing Phase 1 deliverable)
2. Use unknown casting pattern from Phase 2 (json() → text())
3. Add text() to HttpResponse type definition

**Choice:** Unknown casting (Option 2)

**Rationale:**
- Matches Phase 2 pagination.ts pattern: `(await httpClient.request(url)) as unknown as { json(): Promise<unknown> }`
- Avoids modifying completed Phase 1 HTTP client types
- Web-standard fetch Response has text() method - safe to cast
- Consistent pattern across discovery and exhibit services

### Decision 2: ExhibitService orchestrates same flow as DiscoveryService

**Context:** Plan specified mirroring Phase 2 Plan 03 pattern for service orchestration and client delegation.

**Pattern applied:**
- Service class with constructor accepting SecHttpClient
- Public methods orchestrate multi-step flow (fetch → parse → normalize → dedupe → sort)
- Client has private service field initialized in constructor
- Client methods delegate to service methods
- Service methods return fully processed results (no raw data leakage)

**Rationale:**
- Consistency across service modules (discovery, exhibits, future download)
- Clear separation of concerns (client delegates, service orchestrates, modules specialize)
- Testability (service can be unit tested with mocked httpClient)
- Maintainability (all exhibit logic centralized in exhibits module)

### Decision 3: SEC archive URLs use compact accession format

**Context:** Filing index and exhibit URLs require accession without hyphens.

**Format:**
- Input: `0001193125-20-123456` (canonical hyphenated format)
- URL: `000119312520123456` (compact format for SEC archive paths)
- Pattern: `accessionNo.replace(/-/g, "")`

**Rationale:**
- SEC archive URLs use compact format: `/Archives/edgar/data/{cik}/{accessionCompact}/index.html`
- Consistent with SEC API conventions (data.sec.gov uses hyphens, www.sec.gov/Archives uses compact)
- Matches Phase 2 filing URL construction pattern (viewer endpoint also uses compact accession)
- Research findings confirm archive URLs require compact format

## Exported API

From `src/exhibits/index.ts`:

**Classes:**
- `ExhibitService` (new)

**Functions:**
- `parseExhibitTableFromHtml` (from Plan 01)
- `normalizeSequence`, `normalizeExhibitType`, `normalizeDescription` (from Plan 01)
- `dedupeAndSortExhibits` (from Plan 02)
- `isContractExhibit` (from Plan 02)

**Types:**
- `RawExhibit` (from Plan 01)

From `src/client.ts`:

**Classes:**
- `EdgarClient` (now fully functional for exhibits)

**Methods:**
- `listExhibits(filing: FilingRef): Promise<ExhibitRef[]>` — now delegates to ExhibitService
- `listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]>` — now delegates to ExhibitService

## ExhibitService Orchestration Flow

```
listExhibits(filing: FilingRef)
  ↓
1. buildFilingIndexUrl(cik, accessionNo) → SEC archive URL
  ↓
2. httpClient.request(indexUrl) → fetch HTML
  ↓
3. parseExhibitTableFromHtml(htmlContent) → RawExhibit[]
  ↓
4. map(raw => {
     sequence: normalizeSequence(raw.sequence)
     type: normalizeExhibitType(raw.type)
     description: normalizeDescription(raw.description)
     filename: raw.filename
     exhibitUrl: buildExhibitUrl(cik, accessionNo, filename)
   }) → ExhibitRef[]
  ↓
5. dedupeAndSortExhibits(normalized) → ExhibitRef[]
  ↓
Return: deduplicated, sorted ExhibitRef[]
```

```
listContractExhibits(filing: FilingRef)
  ↓
1. listExhibits(filing) → ExhibitRef[]
  ↓
2. filter(e => isContractExhibit(e.type)) → ExhibitRef[]
  ↓
Return: filtered ExhibitRef[] (only EX-10*)
```

## URL Construction Patterns

**Filing Index URL:**
```
https://www.sec.gov/Archives/edgar/data/{cik}/{accessionCompact}/index.html

Example:
CIK: 0000320193
Accession: 0001193125-20-123456
URL: https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/index.html
```

**Exhibit URL:**
```
https://www.sec.gov/Archives/edgar/data/{cik}/{accessionCompact}/{filename}

Example:
CIK: 0000320193
Accession: 0001193125-20-123456
Filename: ex10-1.htm
URL: https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm
```

## Integration Notes

**For Phase 4 (Download Service):**
- ExhibitRef.exhibitUrl provides direct download URL
- ExhibitRef.filename can be used for local storage naming
- ExhibitRef.type enables pre-download filtering (already contract-filtered via listContractExhibits)

**For Phase 5 (Integration):**
- Consider telemetry hooks in ExhibitService (emit metrics on exhibit counts, filter results)
- Consider exposing exhibit parsing options (custom table selectors for non-standard HTML)
- Full-stack integration test: discoverFilings → listContractExhibits → downloadExhibit

## Success Criteria Verification

- [x] ExhibitService class orchestrates complete exhibit enumeration flow
- [x] listExhibits() fetches filing index, parses HTML, normalizes, deduplicates, sorts
- [x] listContractExhibits() filters EX-10* exhibits via isContractExhibit()
- [x] Filing index URLs use correct SEC archive format with compact accession
- [x] Exhibit URLs preserve provenance (www.sec.gov/Archives/edgar/data/{cik}/{accession}/{filename})
- [x] EdgarClient.listExhibits() delegates to ExhibitService
- [x] EdgarClient.listContractExhibits() delegates to ExhibitService
- [x] "Not yet implemented" stubs removed from both client methods
- [x] At least 19 ExhibitService tests pass (19 actual)
- [x] At least 6 EdgarClient exhibit integration tests pass (6 actual)
- [x] ExhibitService exported from exhibits/index.ts
- [x] All prior tests still pass (325 total: 258 prior + 67 new from all Phase 3 plans)
- [x] Typecheck passes, lint passes (only pre-existing warnings)

## Performance

- **Duration:** 259s (~4.3 minutes)
- **Started:** 2026-02-16T04:14:33Z
- **Completed:** 2026-02-16T04:18:48Z
- **Tasks:** 2
- **Files modified:** 5 (2 created, 3 modified)
- **Tests added:** 25 (19 service + 6 client)
- **Total tests passing:** 325 (no regressions)

## Self-Check

Running self-check to verify deliverables...

**Files created:**
- ✓ FOUND: src/exhibits/service.ts
- ✓ FOUND: tests/exhibits/service.test.ts

**Files modified:**
- ✓ FOUND: src/exhibits/index.ts
- ✓ FOUND: src/client.ts
- ✓ FOUND: tests/client.test.ts

**Commits exist:**
- ✓ FOUND: 5f820b6 (Task 1: ExhibitService orchestrator)
- ✓ FOUND: e2fd55a (Task 2: Client wiring)

**Tests pass:**
- ✓ 325 tests pass (19 service + 6 client + 300 from prior phases)
- ✓ Typecheck clean
- ✓ Lint clean (2 pre-existing warnings in http/timeout.test.ts from Phase 1)

**Exports verified:**
- ✓ ExhibitService exported from src/exhibits/index.ts
- ✓ EdgarClient.listExhibits() functional (no longer throws "Not yet implemented")
- ✓ EdgarClient.listContractExhibits() functional (no longer throws "Not yet implemented")

## Self-Check: PASSED

All deliverables verified. Plan 03-03 complete.

---
*Phase: 03-exhibit-enumeration-contract-filtering*
*Completed: 2026-02-16T04:18:48Z*
