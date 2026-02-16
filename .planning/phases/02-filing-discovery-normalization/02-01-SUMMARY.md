---
phase: 02-filing-discovery-normalization
plan: 01
subsystem: discovery/normalization
tags: [normalization, deduplication, validation, pure-functions]
dependency_graph:
  requires: [errors, types]
  provides: [normalizeCik, normalizeAccession, normalizeFormType, validateDate, dedupeAndSort]
  affects: [discovery/service]
tech_stack:
  added: []
  patterns: [pure-functions, identity-key-dedup, stable-sort]
key_files:
  created:
    - src/discovery/normalization.ts
    - src/discovery/deduplication.ts
    - tests/discovery/normalization.test.ts
    - tests/discovery/deduplication.test.ts
  modified:
    - src/discovery/index.ts
decisions:
  - decision: "Use date rollover detection for validateDate"
    rationale: "JavaScript Date constructor is lenient (Feb 30 becomes Mar 2). Compare ISO string output to detect invalid dates."
    status: applied
  - decision: "Deduplication assumes normalized inputs"
    rationale: "dedupeAndSort does NOT normalize internally. Caller must normalize first to avoid double-normalization and ensure consistent identity keys."
    status: applied
  - decision: "Stable sort uses localeCompare for ISO 8601 dates"
    rationale: "ISO 8601 YYYY-MM-DD format is lexicographically sortable. No need for Date parsing in comparator."
    status: applied
metrics:
  duration_seconds: 237
  tasks_completed: 2
  tests_added: 46
  completed_date: "2026-02-16T03:26:27Z"
---

# Phase 02 Plan 01: Normalization & Deduplication Foundations

**One-liner:** Pure normalization functions (CIK padding, accession hyphenation, form uppercase, date validation) with identity-based deduplication and stable sorting

## Summary

Implemented deterministic normalization and deduplication foundations for SEC EDGAR filing discovery. Created four pure normalization functions (normalizeCik, normalizeAccession, normalizeFormType, validateDate) with comprehensive validation and error handling. Implemented dedupeAndSort function using identity key pattern `{cik}:{accessionNo}` with stable sort by filingDate then accessionNo. All functions are idempotent, well-tested, and ready for integration in DiscoveryService.

## Tasks Completed

### Task 1: Implement normalization functions
- **Status:** Complete
- **Commit:** 11d9a38
- **Duration:** ~120s
- **Files:**
  - Created: src/discovery/normalization.ts (118 lines)
  - Created: tests/discovery/normalization.test.ts (267 lines, 35 tests)
  - Modified: src/discovery/index.ts (barrel export)
- **Verification:** All 35 tests pass, typecheck clean
- **Key deliverables:**
  - normalizeCik: zero-pad to 10 digits, validate numeric and range
  - normalizeAccession: canonical ##########-##-###### format
  - normalizeFormType: uppercase with slash preservation
  - validateDate: YYYY-MM-DD validation with rollover detection
  - CIK idempotency verified with 5-iteration test

### Task 2: Implement deduplication and stable sort
- **Status:** Complete
- **Commit:** 82a71ed
- **Duration:** ~117s
- **Files:**
  - Created: src/discovery/deduplication.ts (55 lines)
  - Created: tests/discovery/deduplication.test.ts (272 lines, 11 tests)
  - Modified: src/discovery/index.ts (barrel export)
- **Verification:** All 11 tests pass, typecheck clean, lint clean
- **Key deliverables:**
  - dedupeAndSort: identity key `{cik}:{accessionNo}` deduplication
  - Stable sort: filingDate asc → accessionNo asc
  - Retains first occurrence of duplicates
  - Tested with large datasets (100 filings, 50 duplicates)

## Deviations from Plan

None - plan executed exactly as written. All normalization functions implemented with specified behavior, all tests pass, no architectural changes required.

## Test Coverage

**Total tests added:** 46 (35 normalization + 11 deduplication)

**Normalization tests (35):**
- CIK: padded/unpadded input, idempotency (5 iterations), invalid (letters, special chars, overflow), edge cases (zero, max value)
- Accession: all three format variants (hyphenated, compact, partial), invalid (wrong length, letters, special chars)
- Form type: lowercase, mixed case, uppercase, whitespace, amendments, various forms
- Date: valid dates, leap year, invalid format (separators, length), invalid values (Feb 30, month 13, day 32, non-leap year Feb 29)

**Deduplication tests (11):**
- Empty array, single filing
- Exact duplicates (same CIK + accession) → only first retained
- Multiple duplicates → first occurrence wins
- Same CIK, different accessions → both kept
- Same accession, different CIKs → both kept
- Sort by date (primary), accessionNo (secondary)
- Large dataset (100 filings, 50 duplicates) → correct count and order
- Stable sort verification with chronological order checks

## Key Decisions

1. **Date rollover detection:** JavaScript Date is lenient. Implemented comparison of input vs ISO output to catch invalid dates like Feb 30 (which would silently become Mar 2).

2. **Deduplication separation of concerns:** dedupeAndSort assumes inputs are already normalized. This prevents double-normalization and ensures clear boundaries. Caller (DiscoveryService) is responsible for normalization before deduplication.

3. **Stable sort via localeCompare:** ISO 8601 dates (YYYY-MM-DD) are lexicographically sortable. No Date parsing needed in comparator, improving performance and simplicity.

## Success Criteria Verification

- [x] normalizeCik handles padded, unpadded, and invalid inputs correctly
- [x] normalizeCik is idempotent (5-iteration test passes)
- [x] normalizeAccession handles all three format variants
- [x] dedupeAndSort removes exact duplicates by (cik, accessionNo) identity
- [x] dedupeAndSort produces stable sort: filingDate asc, then accessionNo asc
- [x] All normalization errors throw typed ValidationError
- [x] 46 tests pass covering normalization and deduplication

## Exported API

From `src/discovery/index.ts`:

**Functions:**
- `normalizeCik(input: string): string`
- `normalizeAccession(input: string): string`
- `normalizeFormType(input: string): string`
- `validateDate(input: string): void`
- `dedupeAndSort(filings: FilingRef[]): FilingRef[]`

**Types:**
- `SubmissionsResponse`
- `FilingRecord`

## Integration Notes

**For Phase 2 Plan 2 (DiscoveryService):**
1. Use normalization functions on all data from SEC API before building FilingRef objects
2. Apply dedupeAndSort before returning results to caller
3. Order: fetch → filter → normalize → dedupe → sort
4. Identity key pattern `{cik}:{accessionNo}` is canonical for filing uniqueness

**For Phase 5 (Integration):**
- Consider telemetry hooks in dedupeAndSort to emit warnings when duplicates are found
- No changes to normalization functions needed (already pure and testable)

## Self-Check

Running self-check to verify deliverables...

**Files created:**
- [x] src/discovery/normalization.ts exists
- [x] src/discovery/deduplication.ts exists
- [x] tests/discovery/normalization.test.ts exists
- [x] tests/discovery/deduplication.test.ts exists

**Commits exist:**
- [x] 11d9a38 (Task 1: normalization functions)
- [x] 82a71ed (Task 2: deduplication and stable sort)

**Tests pass:**
- [x] 63 discovery tests pass (35 normalization + 11 deduplication + 17 pagination)
- [x] Typecheck clean
- [x] Lint clean (Task 2 files)

## Self-Check: PASSED

All deliverables verified. Plan 02-01 complete.
