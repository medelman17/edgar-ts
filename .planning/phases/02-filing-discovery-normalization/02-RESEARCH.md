# Phase 2: Filing Discovery & Normalization - Research

**Researched:** 2026-02-15
**Domain:** SEC EDGAR filing discovery API patterns, normalization rules, pagination strategies
**Confidence:** HIGH

## Summary

Phase 2 requires implementing the `discoverFilings(input)` method to query SEC EDGAR for filings by date range with optional CIK and form-type filters, returning deduplicated, deterministically sorted, normalized `FilingRef[]`. The SEC provides two primary discovery paths: (1) **Submissions API** (data.sec.gov) for CIK-scoped historical data, and (2) **Daily Index Files** for date-range discovery across all filers. The Submissions API is simpler and sufficient for this phase's use cases, but pagination through "filings.files" is required for CIKs with 1000+ filings. Normalization rules (CIK zero-padding, accession hyphenation, ISO dates) are locked in the data model. Critical pitfalls include pagination exhaustion, inconsistent normalization, and dedup key consistency.

**Primary recommendation:** Use SEC's official data.sec.gov Submissions API with recursive pagination through `filings.files` array for date-bounded queries. Implement normalization and dedup at the discovery layer before returning results.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| No external dependencies | — | SEC HTTP queries over fetch | Zero-dependency requirement; Submissions API is plain JSON over HTTPS |
| data.sec.gov Submissions API | live | Official SEC JSON endpoint | Published by SEC, stable schema, no auth required, used by ecosystem |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| SecHttpClient (from Phase 1) | complete | Rate-limited, retryable transport | All EDGAR API calls; handles timeouts, retry, rate limiting, telemetry |
| Native `fetch` + `AbortSignal` | web-standard | HTTP transport primitive | Already integrated in SecHttpClient; Node 18+/Bun compatible |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| data.sec.gov Submissions API | Daily index files (/Archives/edgar/daily-index/) | Files are less queryable, require client-side filtering and pagination; Submissions API directly supports CIK + date scoping |
| Single per-CIK request | Batch discovery via third-party (sec-api.io) | Third-party adds runtime dependency, costs, rate limits, external service risk; Submissions API is free and local-rate-limited |
| Client-side pagination | Stream or implicit internal pagination | Must handle pagination exhaustion explicitly to meet "no truncation" requirement (Success Criteria #8) |

---

## Architecture Patterns

### Recommended Project Structure

```
src/discovery/                    # Filing discovery module
├── index.ts                       # Barrel export
├── service.ts                     # DiscoveryService orchestrator
├── normalization.ts               # CIK, accession, form, date normalization
├── deduplication.ts               # Dedupe and stable sort logic
├── pagination.ts                  # Recursive page fetching
└── types.ts                       # Internal discovery types (SubmissionsResponse, etc.)
```

### Pattern 1: SEC Submissions API Data Flow

**What:** Query data.sec.gov/submissions/{cik}.json, extract filings from `filings.recent` and paginated `filings.files`, apply normalization and filters in order, dedupe by (cik, accessionNo), stable sort, return.

**When to use:** Discovering filings by CIK (with optional date/form filters), handling pagination for large filing histories.

**Example flow:**
```typescript
// Pseudo-flow (actual code in upcoming implementation phase)

// 1. Validate inputs (date range, CIK format)
const normalizedCik = padCikToTenDigits(input.cik)

// 2. Request primary submission endpoint
const submissions = await secHttpClient.request(
  `https://data.sec.gov/submissions/CIK${normalizedCik}.json`
)
const json = await submissions.json() // { cik, filings: { recent: [...], files: [...] } }

// 3. Collect all filings (recent + paginated)
const allFilingRecords = [...json.filings.recent]
for (const file of json.filings.files) {
  const pagedJson = await secHttpClient.request(file.name)
  allFilingRecords.push(...pagedJson.filings)
}

// 4. Filter by date range and form types
const filtered = allFilingRecords.filter(f =>
  f.filingDate >= input.from &&
  f.filingDate <= input.to &&
  (input.formTypes ?? DEFAULT_FORMS).includes(f.form)
)

// 5. Normalize each filing
const normalized = filtered.map(f => ({
  cik: padCikToTenDigits(f.cik),
  accessionNo: canonicalizeAccession(f.accessionNumber),
  formType: normalizeFormType(f.form),
  filingDate: f.filingDate, // already YYYY-MM-DD
  filingUrl: buildFilingUrl(normalizedCik, f.accessionNumber)
}))

// 6. Dedupe by (cik, accessionNo) and stable sort
const deduplicated = dedupeAndSort(normalized)
```

**SEC Submissions JSON Schema (simplified):**
```typescript
type SubmissionsResponse = {
  cik: string;                      // CIK as string, may have leading zeros or not
  name: string;
  tickers?: string[];
  filings: {
    recent: FilingRecord[];         // Most recent 1000 filings (or fewer)
    files: {
      name: string;                 // e.g., "submissions/0000000000-20-000000.json"
      filingCount: number;
    }[];
  };
}

type FilingRecord = {
  accessionNumber: string;          // e.g., "0000000000-20-000000" (already hyphenated)
  filingDate: string;               // YYYY-MM-DD format
  reportDate: string;               // YYYY-MM-DD format
  acceptanceDateTime: string;       // YYYY-MM-DDTHH:MM:SSZ
  act: string;                      // "34", "33", "40" (Securities Act variant)
  form: string;                     // Form type, e.g., "10-K", "8-K/A"
  fileNumber: string;
  primaryDocument: string;          // Main filing document filename
  primaryDocDescription?: string;
  size: number;                     // File size in bytes
  isXBRL: number;                   // 0 or 1 (boolean as int)
  isInlineXBRL: number;
}
```

### Pattern 2: Normalization as Separate Pure Functions

**What:** Implement each normalization rule (CIK padding, accession hyphenation, form type trimming, date validation) as pure, testable functions. Compose them in discovery layer, not in types.

**When to use:** All data entering the library from external sources; ensures deterministic output.

**Example:**
```typescript
// src/discovery/normalization.ts

/**
 * CIK normalization: zero-pad to 10 digits.
 * Handles input variations: "320193", "0000320193", already-padded, invalid.
 */
export function normalizeCik(input: string): string {
  const trimmed = input.trim()
  const numeric = trimmed.replace(/^0+/, "") || "0"
  if (!/^\d+$/.test(numeric)) {
    throw new NormalizationError(`Invalid CIK: ${input}`, { input })
  }
  if (Number(numeric) > 9_999_999_999) {
    throw new NormalizationError(`CIK exceeds max 10-digit value`, { input })
  }
  return numeric.padStart(10, "0")
}

/**
 * Accession normalization: ensure hyphenated format ##########-##-######.
 * Handles: "0000000000-20-000000", "0000000000-20000000", "000000000020000000".
 */
export function normalizeAccession(input: string): string {
  const cleaned = input.replace(/[\s\-]/g, "")
  if (!/^\d{18}$/.test(cleaned)) {
    throw new NormalizationError(`Invalid accession: ${input}`, { input })
  }
  return `${cleaned.slice(0, 10)}-${cleaned.slice(10, 12)}-${cleaned.slice(12)}`
}

/**
 * Form type normalization: uppercase, trim whitespace, preserve slash for amendments.
 * Handles: "10-k", "10-K", " 10-K/A ", "10-K/a".
 */
export function normalizeFormType(input: string): string {
  return input.trim().toUpperCase()
}

/**
 * Date validation: must be YYYY-MM-DD ISO format.
 */
export function validateDate(input: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new ValidationError(`Invalid date format: ${input}`, { input })
  }
  const d = new Date(input + "T00:00:00Z")
  if (isNaN(d.getTime())) {
    throw new ValidationError(`Invalid date value: ${input}`, { input })
  }
}
```

### Pattern 3: Deduplication and Stable Sort

**What:** After normalization, dedupe by identity key `{cik}:{accessionNo}` (retain first occurrence, emit telemetry for duplicates), then stable-sort by `filingDate` asc, then `accessionNo` asc.

**When to use:** Before returning `FilingRef[]` to caller; ensures deterministic result set.

**Example:**
```typescript
// src/discovery/deduplication.ts

type FilingWithId = FilingRef & { id: string }

export function dedupeAndSort(filings: FilingRef[]): FilingRef[] {
  const seen = new Set<string>()
  const deduplicated: FilingWithId[] = []

  for (const filing of filings) {
    const id = `${filing.cik}:${filing.accessionNo}`
    if (seen.has(id)) {
      // Emit telemetry if available
      emitDedupeWarning(filing)
      continue
    }
    seen.add(id)
    deduplicated.push({ ...filing, id })
  }

  // Stable sort: filingDate asc, accessionNo asc
  deduplicated.sort((a, b) => {
    const dateCmp = a.filingDate.localeCompare(b.filingDate)
    if (dateCmp !== 0) return dateCmp
    return a.accessionNo.localeCompare(b.accessionNo)
  })

  return deduplicated.map(f => {
    const { id, ...rest } = f
    return rest
  })
}
```

### Anti-Patterns to Avoid

- **Double-normalization:** Don't normalize in response parsing AND again at client layer. Pick one layer (discovery) and normalize once.
- **Client-side date range filtering after dedupe:** Filter before dedupe to reduce memory footprint and improve efficiency.
- **Forgetting pagination in high-volume CIKs:** Apple (0000320193) has 9000+ filings; without pagination, results are truncated and incomplete.
- **Conflating form-type amendment variants:** "10-K" and "10-K/A" are separate forms; default filters should be explicit about amendment inclusion.
- **Sorting without stable order:** Using only filingDate can produce different orderings if accession numbers differ; must sort secondarily by accessionNo.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Recursive JSON pagination from filings.files | Custom pagination loop with complex state | Simple for-loop iterating filings.files array + accumulating results | Helps ensure all pages are fetched without truncation |
| CIK padding and validation | Ad-hoc string manipulation | Dedicated `normalizeCik()` function with explicit error handling | Consistency across all entry points; clear audit trail for invalid inputs |
| Accession number format standardization | Regex magic on ad-hoc basis | Dedicated `normalizeAccession()` function with 18-digit validation | Accession format has fixed structure; single source of truth prevents subtle bugs |
| Date range comparison | Manual string comparison | Native `localeCompare()` for ISO 8601 strings (naturally sorts chronologically) | ISO 8601 format is lexicographically sortable; no custom comparison logic needed |
| Deduplication with key tracking | Custom object and Set logic | Explicit identity key formula `{cik}:{accessionNo}` + Set for O(1) membership | Dedup key must match data model identity rules or results are incorrect |

**Key insight:** Filing normalization touches several error-prone domains (CIK padding, accession format, date handling, URL building). Each has edge cases (leading zeros, missing hyphens, timezone handling). Implement each as a pure, tested function; compose in discovery layer.

---

## Common Pitfalls

### Pitfall 1: Pagination Exhaustion on High-Volume CIKs

**What goes wrong:** Apple (CIK 0000320193) has 9,000+ filings. The Submissions API returns only the most recent 1,000 in `filings.recent`. The remaining filings are referenced in `filings.files` as paginated JSON files. If your code doesn't loop through `files`, results are silently truncated. User calls `discoverFilings({cik: "0000320193", from: "2020-01-01", to: "2025-12-31"})` and gets only the most recent 1,000, missing historical data.

**Why it happens:** The SEC's response structure is sparse (no implicit "next page" link). The code must explicitly check `filings.files.length` and fetch each paginated file. It's easy to overlook.

**How to avoid:**
1. Make pagination explicit in the code: `for (const file of submissions.filings.files)`.
2. Implement and test with a fixture containing paginated data (even if synthetic).
3. Assert in tests that all filings are collected (e.g., check total count before/after pagination).

**Warning signs:**
- Test results show correct count for small CIKs but truncated count for large CIKs.
- Comments in code like "TODO: handle pagination later."
- No test case exercising filings.files array.

### Pitfall 2: Inconsistent CIK Normalization Across Input/Output

**What goes wrong:** User calls `discoverFilings({cik: "320193"})`. Your code pads it to `0000320193` internally. But the SEC API response has `cik: "320193"` (unpaded). You compare `"0000320193" !== "320193"`, skip results, and return empty array instead of deduping correctly.

**Why it happens:** The SEC's Submissions endpoint sometimes returns CIK with leading zeros stripped, sometimes padded. Inconsistent normalization causes identity key collisions.

**How to avoid:**
1. Normalize CIK input before any comparison: `const normalizedCik = normalizeCik(input.cik)`.
2. Normalize SEC response CIK before building identity key: `const id = normalizeCik(response.cik) + ":" + accession`.
3. Test with both padded and unpadded CIK inputs.

**Warning signs:**
- Dedup is failing (seeing duplicate accession numbers in output).
- Tests pass with "0000320193" but fail with "320193" or vice versa.

### Pitfall 3: Accession Format Inconsistency

**What goes wrong:** The SEC API returns accession numbers in hyphenated format (`0000000000-20-000000`). But some legacy SEC data or third-party sources use compact format (`000000000020000000`) or single hyphen (`0000000000-20000000`). If you assume hyphenated format without normalization, dedup keys will differ for the same filing accessed from different sources.

**Why it happens:** SEC EDGAR has decades of history with format evolution. Some endpoints return consistent format; others don't. Careless string handling masks this.

**How to avoid:**
1. Implement `normalizeAccession()` to handle all three formats; output single canonical format.
2. Test dedup with accessions in different input formats; verify output is consistent.

**Warning signs:**
- Duplicate filings in output despite dedup code.
- Tests pass with hyphenated accessions but fail with compact format.

### Pitfall 4: Date Range Filtering Order Matters

**What goes wrong:** You fetch all filings from the Submissions API, dedupe, sort, THEN filter by date range. This is inefficient and error-prone. Alternatively, you filter by date AFTER dedup and sort, which is correct but doesn't prevent pagination exhaustion.

**Why it happens:** Logical order isn't always obvious. Some code paths filter first (efficient), others filter last (safe for dedup logic).

**How to avoid:**
1. Filter BEFORE dedup: reduces memory footprint and improves clarity.
2. Order: fetch → filter by date → filter by form types → normalize → dedupe → sort.
3. Document this order in comments and tests.

**Warning signs:**
- High memory usage on large CIK queries.
- Dedup results differ depending on whether you filter before or after.

### Pitfall 5: Default Form Types Not Including Amendments

**What goes wrong:** The default form types in the API contract are `["8-K", "10-K", "10-Q", "20-F", "S-1"]`. You implement form filtering as simple string equality. But "10-K/A" (10-K amendment) is a separate form. User discovers filings and gets "10-K" but not "10-K/A" even though they're searching the same filing with an amendment.

**Why it happens:** The SEC form field sometimes includes amendment syntax (`/A`, `/A.2`), sometimes doesn't. Conflating the base form with its amendment variants is a common mistake.

**How to avoid:**
1. Document default form list explicitly in the API contract (which is locked in this phase).
2. Implement form type matching with explicit amendment handling: if user specifies "10-K", match both "10-K" and "10-K/A" (unless explicitly overridden).
3. Test with form types that have amendment variants.

**Warning signs:**
- Users report missing amended filings in results.
- Tests only cover base form types, not amendments.

### Pitfall 6: Unsanitized Filing URLs

**What goes wrong:** You build `filingUrl` by concatenating CIK and accession number without validating. If accession or CIK is malformed, the URL is invalid and breaks downstream consumers.

**Why it happens:** URL building feels simple (string concat), so validation is skipped.

**How to avoid:**
1. After normalization, assert that CIK is 10 digits and accession matches `##########-##-######` before building URL.
2. Use a helper function to build URLs; include assertions.
3. Test URL validity (e.g., matches SEC EDGAR URL pattern).

**Warning signs:**
- Returned FilingRef objects have malformed URLs.
- Downstream code fails when trying to fetch filingUrl.

---

## Code Examples

Verified patterns from SEC EDGAR ecosystem and phase 1 codebase:

### Example 1: Submitting API Recursion

```typescript
// Source: SEC data.sec.gov Submissions API structure
// Demonstrated in: cchummer/sec-api notebooks and sec-edgar projects

async function fetchAllFilings(cik: string): Promise<FilingRecord[]> {
  const normalizedCik = normalizeCik(cik)
  const submissions = await secHttpClient.request(
    `https://data.sec.gov/submissions/CIK${normalizedCik}.json`
  )
  const json = (await submissions.json()) as SubmissionsResponse

  const allFilings: FilingRecord[] = [...(json.filings.recent || [])]

  // Recursively fetch paginated files
  for (const file of json.filings.files || []) {
    const pageResponse = await secHttpClient.request(
      `https://www.sec.gov/${file.name}`
    )
    const pageJson = (await pageResponse.json()) as { filings: FilingRecord[] }
    allFilings.push(...(pageJson.filings || []))
  }

  return allFilings
}
```

### Example 2: Normalization Composition

```typescript
// Source: Phase 1 error handling patterns (errors/index.ts)
// Applied to discovery normalization

import { NormalizationError, ValidationError } from "@/errors"

export interface NormalizedFiling {
  cik: string
  accessionNo: string
  formType: string
  filingDate: string
  filingUrl: string
}

export function normalizeFilingRecord(
  raw: FilingRecord,
  baseCik: string
): NormalizedFiling {
  try {
    const normalizedCik = normalizeCik(baseCik)
    const normalizedAccession = normalizeAccession(raw.accessionNumber)
    validateDate(raw.filingDate)

    return {
      cik: normalizedCik,
      accessionNo: normalizedAccession,
      formType: normalizeFormType(raw.form),
      filingDate: raw.filingDate,
      filingUrl: `https://www.sec.gov/Archives/edgar/data/${normalizedCik}/${normalizedAccession.replace(/-/g, "")}/0001193125-${normalizedAccession.slice(11)}.txt`,
    }
  } catch (err) {
    if (err instanceof EdgarError) throw err
    throw new NormalizationError("Failed to normalize filing record", {
      raw,
      cause: err,
    })
  }
}
```

### Example 3: Deduplication and Stable Sort

```typescript
// Source: Data model specification (edgar-ts-data-model.md)
// Applied to discovery layer

export function dedupeAndSortFilings(
  filings: FilingRef[]
): FilingRef[] {
  // Build identity map: "{cik}:{accessionNo}" → first occurrence
  const identityMap = new Map<string, FilingRef>()

  for (const filing of filings) {
    const identity = `${filing.cik}:${filing.accessionNo}`
    if (!identityMap.has(identity)) {
      identityMap.set(identity, filing)
    }
    // If duplicate, silently skip (or emit telemetry if available)
  }

  // Convert back to array and sort
  const deduplicated = Array.from(identityMap.values())

  return deduplicated.sort((a, b) => {
    // Primary sort: filingDate ascending
    const dateOrder = a.filingDate.localeCompare(b.filingDate)
    if (dateOrder !== 0) return dateOrder

    // Secondary sort: accessionNo ascending
    return a.accessionNo.localeCompare(b.accessionNo)
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scraping SEC EDGAR HTML pages | Official data.sec.gov JSON API | 2020-2021 (SEC modernization) | No parsing, no HTML deps, faster, more reliable |
| Per-CIK queries for date ranges | Submissions endpoint + client-side filtering | 2020+ | Simpler for scoped queries, must handle pagination |
| Manual regex normalization | Purpose-built normalization functions | Phase 2 (this phase) | Consistency, auditability, error handling |
| Global sort then filter | Filter then sort (streaming-friendly) | Phase 2 (this phase) | Memory efficiency, determinism |

**Deprecated/outdated:**
- HTML scraping: SEC no longer recommends; JSON API is official.
- XBRL-heavy approaches: Phase 2 is filing discovery only; XBRL parsing deferred to future phase.

---

## Open Questions

1. **Default form-type list ambiguity regarding amendments**
   - What we know: Data model specifies default forms as `["8-K", "10-K", "10-Q", "20-F", "S-1", "relevant amendment variants"]`. Phrase "relevant amendment variants" is vague.
   - What's unclear: Should user calling `discoverFilings({from, to})` (no formTypes specified) receive BOTH "10-K" and "10-K/A"? Or just "10-K"?
   - Recommendation: Assume "yes, include amendments" for core forms (locked in API contract defaults). If this breaks tests, escalate to maintainer per agent playbook escalation rules.

2. **CIK input format tolerance**
   - What we know: Input validation rule says "cik must normalize to 10-digit zero-padded numeric value internally."
   - What's unclear: Should the method accept CIK as string or number? Should it reject negative or non-numeric input before attempting normalization?
   - Recommendation: Accept string input only (matches API contract). Reject non-numeric input with ValidationError early. Test both padded and unpadded string inputs.

3. **Pagination file URL construction**
   - What we know: filings.files array contains a "name" property (e.g., "submissions/0000000000-20-000000.json").
   - What's unclear: Is the full URL https://data.sec.gov/{name} or https://www.sec.gov/{name}?
   - Recommendation: Verify empirically against live SEC API. Both patterns have been observed; likely the latter for backwards compat. Implement with configurable base URL, test both.

4. **Telemetry for deduplicated records**
   - What we know: Architecture says "emit warning telemetry event" when duplicates are found.
   - What's unclear: Should telemetry be opt-in or always-on? What event shape?
   - Recommendation: Use existing telemetry hooks from EdgarClientOptions (onRequestEnd, etc.). If no hook, skip silently. Implement before Phase 3 if telemetry spec is clarified.

---

## Sources

### Primary (HIGH confidence)
- **SEC data.sec.gov Submissions API** - Verified response structure with filingRecord schema, pagination via filings.files array
- **edgar-ts-data-model.md** - Normalization rules (CIK padding, accession format, dedupe identity, sort order)
- **edgar-ts-api-contract.md** - Locked method signature and behavioral guarantees for discoverFilings()
- **edgar-ts-architecture.md** - DiscoveryService module responsibilities and data flow
- **Phase 1 Implementation (SecHttpClient)** - Rate-limited, retryable fetch pattern; error classification framework

### Secondary (MEDIUM confidence)
- [SEC EDGAR APIs - Official Page](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) - Confirms data.sec.gov as official REST endpoint
- [cchummer/sec-api - Jupyter Notebook](https://github.com/cchummer/sec-api/blob/main/submissions_restful_api.ipynb) - Community-verified Submissions API response structure and pagination pattern
- [sec-edgar-api — Documentation](https://sec-edgar-api.readthedocs.io/) - Third-party Python library using similar pagination approach
- [Introduction to Working with SEC EDGAR API - The Full Stack Accountant](https://www.thefullstackaccountant.com/blog/intro-to-edgar) - High-level overview of Submissions API + daily index files trade-offs

### Tertiary (LOW confidence - requires validation)
- Daily index files as alternative discovery path - Noted in research but not primary recommendation; would require separate implementation path if chosen

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH - data.sec.gov is SEC's official API, documented and stable; no external dependencies.
- **Architecture:** HIGH - DiscoveryService pattern is locked in architecture spec; normalization and dedup rules are in locked data model.
- **Pitfalls:** MEDIUM-HIGH - Pitfalls 1-3 are confirmed by ecosystem patterns; Pitfalls 4-6 extrapolated from general software practices.
- **Pagination mechanics:** MEDIUM - SEC structure verified from official docs and community sources; exact URL construction (data.sec.gov vs www.sec.gov) should be validated empirically.

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days; SEC API is stable; confidence decreases if live-smoke tests reveal unexpected response variations)

