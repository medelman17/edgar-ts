---
phase: 03-exhibit-enumeration-contract-filtering
plan: 01
subsystem: exhibits
tags: [parsing, normalization, html, node-compat]
requires:
  - errors (ValidationError, ParseError)
provides:
  - parseExhibitTableFromHtml
  - normalizeSequence
  - normalizeExhibitType
  - normalizeDescription
  - RawExhibit type
affects:
  - exhibits module (new parsing and normalization foundations)
tech_stack:
  added:
    - Custom HTML table parsing (regex-based, no DOMParser)
    - HTML entity decoding (inline implementation)
  patterns:
    - Pure normalization functions (Phase 2 pattern reuse)
    - Explicit return type annotations (isolatedDeclarations)
key_files:
  created:
    - src/exhibits/parsing.ts (159 lines)
    - src/exhibits/normalization.ts (101 lines)
    - src/exhibits/types.ts (19 lines)
    - tests/exhibits/parsing.test.ts (492 lines)
    - tests/exhibits/normalization.test.ts (276 lines)
  modified:
    - src/exhibits/index.ts (barrel exports)
decisions:
  - title: Custom HTML parsing without DOMParser
    rationale: DOMParser is not available in Node.js 18+. Zero-dep requirement prohibits external libraries. Custom regex-based parsing is reliable for SEC filing index table structure.
    alternatives: [cheerio (violates zero-dep), jsdom (violates zero-dep), DOMParser (not available)]
    chosen: Custom regex extraction + string operations
  - title: Preserve leading zeros in sequence normalization
    rationale: Filing index tables may contain both "1" and "001" as distinct sequence numbers. Preserving leading zeros ensures identity uniqueness for deduplication.
    alternatives: [strip leading zeros (loses distinction), parse to number (type mismatch)]
    chosen: Preserve leading zeros as-is after trimming
  - title: Separator normalization to hyphen
    rationale: SEC exhibit types appear with underscore (EX_10), slash (EX/10), and hyphen (EX-10) separators. Canonical hyphenated format aligns with official EDGAR documentation.
    alternatives: [preserve as-is (inconsistent), normalize to underscore]
    chosen: Normalize all to hyphen (EX-10)
metrics:
  duration: 230
  tasks_completed: 2
  tests_added: 63
  files_created: 5
  files_modified: 1
  lines_added: 1047
  completed_at: "2026-02-16T04:11:02Z"
---

# Phase 03 Plan 01: HTML Parsing & Normalization Foundations Summary

**One-liner:** Custom HTML table parsing and exhibit field normalization with separator variant handling, Node 18+ compatible without DOMParser.

## Overview

Implemented foundational parsing and normalization capabilities for Phase 3 (Exhibit Enumeration & Contract Filtering). Created custom HTML table parser that works on Node.js 18+ without DOMParser, and pure normalization functions for exhibit sequence, type, and description fields. All separator variants (underscore, slash, hyphen) normalize to canonical hyphenated format.

## What Was Built

### Parsing Infrastructure

**parseExhibitTableFromHtml()** — Custom HTML table parsing (Node 18+ compatible)
- Regex-based table extraction: `/<table[\s\S]*?<\/table>/i`
- Row-by-row parsing: `/<tr[\s\S]*?<\/tr>/gi`
- Cell extraction: `/<td[\s\S]*?<\/td>/gi`
- HTML entity decoding: `&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;`, `&nbsp;`
- Filename extraction from `<a href="...">` tags
- Header row detection and skipping (`<th>` tags)
- Malformed row handling (skip rows with <4 cells, empty sequence/type)

**Cell mapping (0-indexed):**
1. Cell 0: sequence
2. Cell 1: description
3. Cell 2: filename (extract from href or text)
4. Cell 3: type
5. Cell 4+: ignored (size, date, etc.)

**RawExhibit type:**
```typescript
type RawExhibit = {
  sequence: string
  filename: string
  type: string
  description?: string
}
```

### Normalization Functions

**normalizeSequence(input: string): string**
- Validates numeric-only string: `/^\d+$/`
- Preserves leading zeros (e.g., "001" → "001")
- Trims whitespace
- Throws ValidationError on invalid input

**normalizeExhibitType(input: string): string**
- Converts to uppercase
- Normalizes separators: `_` and `/` → `-`
- Validates pattern: `/^EX-\d+(\.\d+|[A-Z])?$/`
- Supports forms: EX-10, EX-10.1, EX-10A
- Throws ValidationError on invalid pattern

**normalizeDescription(input?: string): string | undefined**
- Trims whitespace
- Converts empty/whitespace-only to undefined
- No validation (freeform text)

## Test Coverage

**Parsing tests (21 tests):**
- Real EDGAR table structures with multiple exhibits
- Filename extraction from href attributes
- HTML entity decoding (&amp;, &quot;, &#39;, &nbsp;)
- Whitespace handling (leading/trailing, newlines, tabs)
- Header row detection and skipping
- Malformed input (missing cells, empty sequence/type, no table, no rows)
- Case-insensitive tag matching (TABLE, table, Table)

**Normalization tests (42 tests):**
- Sequence: valid (1, 001, 999), invalid (abc, 12a, 1.5, -1, empty)
- Type: separator variants (EX_10, EX/10, EX-10 → EX-10.1), case normalization, dotted/letter suffix formats
- Type: invalid patterns (10-EX, EX10, EX-, EX-10.1.2)
- Description: trimming, empty → undefined, special characters, long strings

**Total: 63 new tests, 300 total passing (no regressions)**

## Deviations from Plan

None — plan executed exactly as written.

## Key Patterns Applied

**Phase 2 normalization pattern reuse:**
- Pure functions with explicit return types
- ValidationError with metadata context
- Idempotent normalization (normalize(normalize(x)) === normalize(x))
- No `any` types (noExplicitAny: error)

**Node 18+ compatibility constraint:**
- No DOMParser usage
- Custom string-based HTML parsing
- Inline HTML entity decoding
- Zero runtime dependencies

**HTML parsing strategy:**
1. Extract table block (regex)
2. Split into rows (regex)
3. Extract cells from each row (regex)
4. Clean cell content (strip tags, decode entities, trim)
5. Map cells to RawExhibit fields
6. Skip invalid/header rows

## Edge Cases Discovered

1. **Multiple separators in type:** "EX_10/1" was tested but is not a real EDGAR format. Fixed test to use realistic variant "EX_10.1".
2. **Empty description cells:** HTML tables may have empty `<td></td>` for description. Parser correctly handles as undefined.
3. **Whitespace in numeric sequences:** SEC may include whitespace padding. normalizeSequence() trims correctly.
4. **Mixed case HTML tags:** Real EDGAR HTML varies between `<table>`, `<TABLE>`, `<Table>`. Regex uses case-insensitive flag.

## Verification Results

**Parsing verification:**
- ✅ parseExhibitTableFromHtml() extracts all fields from real EDGAR table structure
- ✅ No DOMParser usage (verified via grep)
- ✅ 21 parsing tests pass

**Normalization verification:**
- ✅ Exhibit type variants normalize to hyphenated form (EX-10.1)
- ✅ Sequence validation rejects non-numeric input
- ✅ 42 normalization tests pass

**Integration check:**
- ✅ All 300 tests pass (no regressions in Phase 1 or Phase 2)
- ✅ Typecheck passes
- ✅ Lint passes (2 pre-existing warnings in http/timeout.test.ts)

## Exported API

**From `src/exhibits/index.ts`:**
```typescript
export { parseExhibitTableFromHtml } from "./parsing"
export type { RawExhibit } from "./types"
export { normalizeSequence, normalizeExhibitType, normalizeDescription } from "./normalization"
```

## Next Steps

Plan 03-02 will build on these foundations to:
- Implement ExhibitService orchestrator (parse → normalize → map to ExhibitRef)
- Integrate with SecHttpClient for filing index fetching
- Add contract filtering (EX-10* pattern matching)
- Wire into EdgarClient.listExhibits() and listContractExhibits()

## Self-Check

Verifying all artifacts exist and commits are recorded.

**Files created:**
- ✅ src/exhibits/parsing.ts exists
- ✅ src/exhibits/normalization.ts exists
- ✅ src/exhibits/types.ts exists
- ✅ tests/exhibits/parsing.test.ts exists
- ✅ tests/exhibits/normalization.test.ts exists

**Commits:**
- ✅ 9785a34: feat(03-01): implement HTML parsing and exhibit type definitions
- ✅ a3382f0: feat(03-01): implement exhibit normalization functions

## Self-Check: PASSED
