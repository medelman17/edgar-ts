---
phase: 03-exhibit-enumeration-contract-filtering
plan: 02
subsystem: exhibit-deduplication-filtering
tags: [deduplication, sorting, filtering, ex-10]
dependency_graph:
  requires:
    - 02-01 (filing deduplication pattern)
    - Phase 1 (HTTP transport)
  provides:
    - exhibit-deduplication (filing-local identity)
    - exhibit-stable-sort (sequence numeric, filename string)
    - contract-filter (EX-10* pattern matching)
  affects:
    - 03-03 (ExhibitService integration)
tech_stack:
  added: []
  patterns:
    - filing-local identity keys (accessionNo:sequence)
    - numeric sequence comparison (not lexicographic)
    - regex pattern matching (/^EX-10(\.\d+|[A-Z])?$/)
key_files:
  created:
    - src/exhibits/deduplication.ts
    - src/exhibits/filters/contract.ts
    - tests/exhibits/deduplication.test.ts
    - tests/exhibits/filters/contract.test.ts
  modified:
    - src/exhibits/index.ts
decisions:
  - Filing-local identity (accessionNo:sequence) vs global identity (cik:accessionNo)
  - Numeric sequence sort prevents multi-digit lexicographic errors (10 after 2)
  - Contract filter regex matches all EX-10 variants (base, dotted, lettered)
  - Deduplication assumes normalized inputs (matches Phase 2 pattern)
metrics:
  duration_seconds: 152
  tasks_completed: 2
  tests_added: 47
  files_created: 4
  files_modified: 1
  commits: 2
  completed_date: "2026-02-15"
---

# Phase 03 Plan 02: Exhibit Deduplication and Contract Filtering Summary

**Implemented exhibit deduplication with filing-local identity, numeric sequence sorting, and EX-10* contract filtering using regex pattern matching.**

## What Was Built

### Deduplication Module (`src/exhibits/deduplication.ts`)

**Core Function:** `dedupeAndSortExhibits(exhibits: ExhibitRef[]): ExhibitRef[]`

**Filing-local identity strategy:**
- Identity key: `${accessionNo}:${sequence}` (different from Phase 2's `${cik}:${accessionNo}`)
- Retains first occurrence of duplicates
- Assumes inputs are already normalized (accession hyphenated, type uppercase)

**Stable two-level sort:**
1. **Primary: sequence NUMERIC ascending**
   - Critical: `Number(a.sequence) - Number(b.sequence)`
   - Prevents multi-digit lexicographic errors: 10 comes after 2 (not before)
   - Lexicographic comparison would incorrectly order "10" < "2"
2. **Secondary: filename STRING ascending**
   - Uses `localeCompare()` for string comparison
   - Breaks ties when sequences equal

**Algorithm pattern:**
```typescript
// Build identity map
const identityMap = new Map<string, ExhibitRef>()
for (const exhibit of exhibits) {
  const identity = `${exhibit.accessionNo}:${exhibit.sequence}`
  if (!identityMap.has(identity)) {
    identityMap.set(identity, exhibit)
  }
}

// Stable sort
return Array.from(identityMap.values()).sort((a, b) => {
  const seqA = Number(a.sequence)
  const seqB = Number(b.sequence)
  if (seqA !== seqB) return seqA - seqB
  return a.filename.localeCompare(b.filename)
})
```

### Contract Filter Module (`src/exhibits/filters/contract.ts`)

**Core Function:** `isContractExhibit(normalizedType: string): boolean`

**Pattern:** `/^EX-10(\.\d+|[A-Z])?$/`

**Matches:**
- Base form: `EX-10`
- Dotted variants: `EX-10.1`, `EX-10.2`, `EX-10.01`, `EX-10.123`
- Letter suffixes: `EX-10A`, `EX-10B`, `EX-10Z`

**Rejects:**
- Other exhibits: `EX-21`, `EX-99`, `EX-23`, `EX-31`, `EX-32`
- Invalid format: `EX10` (no hyphen), `10-EX` (reversed), `EX-10.1.2` (too many dots)
- Multi-letter suffixes: `EX-10AB`
- Lowercase (normalization happens upstream): `ex-10`

**Regex breakdown:**
- `^EX-10` — Must start with "EX-10"
- `(\.\d+|[A-Z])?` — Optional: dot + digits OR single uppercase letter
- `$` — Must end (prevents partial matches)

## Test Coverage

**Total: 47 tests (exceeds minimum 35)**

### Deduplication Tests: 16
- **Deduplication (8 tests):**
  - Empty array handling
  - Single exhibit passthrough
  - Exact duplicate removal
  - First occurrence retention
  - Multiple duplicates handling
  - Same accessionNo, different sequences (both kept)
  - Same sequence, different accessionNo (both kept)
  - Large dataset: 100 exhibits, 50 duplicates → 50 unique

- **Sorting (8 tests):**
  - Numeric sequence ascending: [10, 2, 1] → [1, 2, 10]
  - Same sequence, filename ascending
  - Mixed sequences and filenames (stable two-level sort)
  - Verify 10 after 2 (not lexicographic)
  - Multi-digit sequences: 1, 2, 10, 11, 100 → correct numeric order
  - Filename secondary sort: [c.htm, a.htm, b.htm] → [a, b, c]
  - Combined dedup + sort with unsorted duplicates

### Contract Filter Tests: 31
- **Positive matches (13 tests):**
  - Base: `EX-10`
  - Dotted single digit: `EX-10.1`, `EX-10.2`, `EX-10.9`
  - Dotted multi-digit: `EX-10.01`, `EX-10.10`, `EX-10.99`
  - Dotted three digits: `EX-10.001`, `EX-10.123`
  - Letter suffixes: `EX-10A`, `EX-10B`, `EX-10Z`
  - Edge case: `EX-10.0`

- **Negative matches (15 tests):**
  - Other exhibits: `EX-21`, `EX-99`, `EX-23`, `EX-31`, `EX-32`
  - Invalid format: `EX10`, `10-EX`, `EX-10.1.2`
  - Lowercase: `ex-10`
  - Wrong separators: `EX_10`, `EX/10`
  - Empty string
  - Non-EX types: `10-K`
  - Multi-letter: `EX-10AB`
  - Letter after dot: `EX-10.A`

- **Combined filtering (3 tests):**
  - Filter mixed array to only EX-10* variants
  - Empty result when no contracts present
  - All results when all are contracts

## Deviations from Plan

None — plan executed exactly as written.

All tasks completed as specified:
- Deduplication follows Phase 2 pattern (identity map + stable sort)
- Numeric sequence comparison implemented correctly
- Contract filter regex matches all EX-10 variants
- Test coverage exceeds minimums (47 vs 35 required)

## Key Decisions

### 1. Filing-local vs Global Identity

**Decision:** Use `${accessionNo}:${sequence}` identity key (not `${cik}:${accessionNo}`)

**Rationale:**
- Exhibits are filing-local (multiple filings can have sequence "1")
- Different from Phase 2 where filings are globally unique by CIK + accession
- Prevents false deduplication across different filings

### 2. Numeric vs Lexicographic Sequence Sort

**Decision:** Parse sequence to Number for comparison (`Number(a.sequence) - Number(b.sequence)`)

**Rationale:**
- Lexicographic comparison treats "10" < "2" (wrong)
- Numeric comparison treats 10 > 2 (correct)
- Multi-digit sequences (10, 11, 100) must sort after single-digit (1, 2, 9)
- Critical for correct exhibit enumeration order

### 3. Contract Filter Pattern

**Decision:** Use `/^EX-10(\.\d+|[A-Z])?$/` regex pattern

**Rationale:**
- Matches all SEC-standard EX-10 variants (base, dotted, lettered)
- Anchors (^$) prevent partial matches
- Alternative group `(\.\d+|[A-Z])?` handles both dotted and lettered forms
- Rejects invalid formats (no hyphen, too many dots, multiple letters)

### 4. Deduplication Assumes Normalized Inputs

**Decision:** `dedupeAndSortExhibits()` does NOT normalize internally

**Rationale:**
- Matches Phase 2 deduplication pattern (separation of concerns)
- Prevents double-normalization when called from upstream normalizer
- Simplifies function contract (single responsibility)
- Upstream ExhibitService will normalize before deduplicating (Plan 03-03)

## Verification Results

**All success criteria met:**

- ✅ dedupeAndSortExhibits() deduplicates by (accessionNo, sequence) identity
- ✅ Deduplication retains first occurrence when duplicates exist
- ✅ Stable sort: sequence numeric ascending (not lexicographic), then filename ascending
- ✅ Numeric sequence comparison handles multi-digit correctly (10 after 2)
- ✅ isContractExhibit() matches all EX-10 variants (base, dotted, lettered)
- ✅ Contract filter pattern: /^EX-10(\.\d+|[A-Z])?$/ matches EX-10, EX-10.1, EX-10A
- ✅ Contract filter rejects non-EX-10 exhibits (EX-21, EX-99, etc.)
- ✅ 16 deduplication tests pass (exceeds minimum 15)
- ✅ 31 contract filter tests pass (exceeds minimum 20)
- ✅ All functions exported from exhibits/index.ts barrel
- ✅ Typecheck passes, lint passes (only pre-existing warnings)
- ✅ No regressions: all 258 tests pass (previous 211 + new 47)

**Test results:**
```
✓ tests/exhibits/deduplication.test.ts (16 tests) 10ms
✓ tests/exhibits/filters/contract.test.ts (31 tests) 3ms
✓ All tests: 258 passed (14 test files)
```

**Performance:**
- Duration: 152 seconds (2.5 minutes)
- Tasks: 2
- Tests: 47 (16 deduplication + 31 contract filter)
- Files created: 4
- Files modified: 1
- Commits: 2

## Exported API

From `src/exhibits/index.ts`:

```typescript
// Deduplication and sorting
export { dedupeAndSortExhibits } from "./deduplication"

// Contract filtering
export { isContractExhibit } from "./filters/contract"
```

**Usage pattern:**
```typescript
// Dedup and sort exhibits within a filing
const exhibits: ExhibitRef[] = [/* ... */]
const deduplicated = dedupeAndSortExhibits(exhibits)

// Filter to only contract exhibits (EX-10*)
const contracts = deduplicated.filter(e => isContractExhibit(e.type))
```

## Next Steps

**Ready for Phase 3 Plan 03:** ExhibitService Integration & Client Wiring

With deduplication and filtering complete, Plan 03 will:
1. Create ExhibitService orchestrator (listExhibits, listContractExhibits)
2. Wire to EdgarClient public methods
3. Integrate with Phase 3 Plan 01 exhibit parsing
4. Add end-to-end tests with real filing data

**Dependencies satisfied:**
- ✅ Exhibit deduplication (this plan)
- ✅ Contract filtering (this plan)
- ✅ Exhibit parsing (Plan 03-01)
- ✅ HTTP transport (Phase 1)

## Commits

| Commit | Type | Description |
|--------|------|-------------|
| b77447a | feat(03-02) | Implement exhibit deduplication and stable sort |
| 0df7596 | feat(03-02) | Implement contract exhibit filter (EX-10*) |

## Self-Check: PASSED

**Files verified:**
```bash
✓ src/exhibits/deduplication.ts exists
✓ src/exhibits/filters/contract.ts exists
✓ tests/exhibits/deduplication.test.ts exists
✓ tests/exhibits/filters/contract.test.ts exists
✓ src/exhibits/index.ts modified
```

**Commits verified:**
```bash
✓ b77447a exists (feat(03-02): implement exhibit deduplication and stable sort)
✓ 0df7596 exists (feat(03-02): implement contract exhibit filter (EX-10*))
```

**Tests verified:**
```bash
✓ All 258 tests pass
✓ 16 deduplication tests pass
✓ 31 contract filter tests pass
✓ No regressions in prior phases
```
