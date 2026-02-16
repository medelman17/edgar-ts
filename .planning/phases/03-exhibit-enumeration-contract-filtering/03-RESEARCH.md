# Phase 3: Exhibit Enumeration & Contract Filtering - Research

**Researched:** 2026-02-15
**Domain:** SEC EDGAR filing exhibit enumeration, normalization, and contract-exhibit filtering (EX-10* contract detection)
**Confidence:** HIGH

## Summary

Phase 3 extends the discovery layer (Phase 2) to enumerate exhibits within filings and filter for material contracts (EX-10* exhibits). The phase requires parsing exhibit metadata from SEC filing index structures, normalizing exhibit types and sequences deterministically, deduplicating by filing-local identity, and implementing a specialized `EX-10*` matcher for contract acquisition workflows.

Exhibit metadata is available via two retrieval patterns: (1) **Filing index documents** (in HTML or JSON formats from EDGAR archives) containing exhibit tables with sequence, type, description, filename, and URLs, and (2) **XBRL inline disclosure files** (newer filings) with structured exhibit metadata. For v1, focus is on parsing filing index documents (the simpler, more universally available pattern). Normalization rules (sequence trimming, type uppercasing, punctuation handling) are locked in the data model. The contract filter must match all `EX-10` variants: `EX-10`, `EX-10.1`, `EX-10.2`, `EX-10A`, `EX-10.01`, and format variations (`EX_10`, `EX/10`) normalized consistently.

**Primary recommendation:** Fetch filing index documents from EDGAR (format: HTML or JSON index), parse exhibit tables using structured extraction (HTML table parsing or JSON deserialization), apply normalization and dedup at the exhibit service layer (parallel to discovery service), and implement `EX-10*` matcher as a pure function with explicit variant support.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| No external dependencies | — | Exhibit parsing via fetch + structured extraction | Zero-dependency requirement; EDGAR returns HTML/JSON natively |
| SecHttpClient (from Phase 1) | complete | Rate-limited, retryable transport for exhibit endpoints | All EDGAR requests go through SecHttpClient; handles timeouts, retry, rate limiting |
| Native DOM/HTML parsing | web-standard (via DOMParser) or custom regex | Extract exhibit tables from HTML index documents | DOMParser available in browser and modern Node.js (v19+)/Bun; alternative is custom table row parsing |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Phase 2 Normalization helpers | complete | CIK, accession canonical formats | Exhibits share filing identity (accessionNo); reuse phase 2 functions |
| Phase 2 Deduplication patterns | complete | Identity key (`accessionNo:sequence`) + stable sort | Exhibits dedupe by filing-local (accessionNo, sequence) identity; reuse dedup patterns |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Parsing HTML index documents | XBRL inline data extraction | XBRL is more structured but requires XML parsing, only available for newer filings; HTML index is universal back to 1990s |
| Filing index from `www.sec.gov/Archives` | data.sec.gov API or daily index files | No official data.sec.gov exhibit endpoint exists; daily index files are master-only (CIK, form, date); must fall back to archive HTML |
| Custom HTML table parsing | Using a DOM parser library | DOMParser is web-standard (Node 19+, Bun, browsers); no runtime dependency; custom parsing adds complexity with regex fragility |
| Per-filing HTTP request | Batch exhibit lookup via third-party API | Third-party adds cost, rate limits, external service dependency; direct EDGAR is free and local-rate-limited |

---

## Architecture Patterns

### Recommended Project Structure

```
src/exhibits/                         # Exhibit enumeration module
├── index.ts                           # Barrel export
├── service.ts                         # ExhibitService orchestrator
├── parsing.ts                         # Filing index HTML/JSON parsing
├── normalization.ts                   # Exhibit type, sequence normalization
├── deduplication.ts                   # Exhibit dedupe and stable sort
├── filters/                           # Exhibit filtering strategies
│   └── contract.ts                    # EX-10* contract matcher
└── types.ts                           # Internal exhibit types
```

### Pattern 1: Filing Index Parsing Flow

**What:** Fetch filing index document (HTML or JSON) from `https://www.sec.gov/Archives/edgar/data/{cik}/{accession_no_compact}/`, extract exhibit rows/entries, map to normalized `ExhibitRef` records, dedupe by identity, sort stably.

**When to use:** Enumerating exhibits within a filing; preserving provenance URLs and metadata from source.

**Example flow:**
```typescript
// Pseudo-flow (actual code in upcoming implementation phase)

// 1. Construct filing index URL from FilingRef
const indexUrl = buildFilingIndexUrl(filing.cik, filing.accessionNo)

// 2. Fetch index document (HTML or JSON format)
const indexResponse = await secHttpClient.request(indexUrl)
const indexHtml = await indexResponse.text() // or .json() for JSON variant

// 3. Parse exhibit table from HTML/JSON
const rawExhibits = parseExhibitTable(indexHtml) // Returns array of raw exhibit records

// 4. Normalize each exhibit
const normalized = rawExhibits.map(e => ({
  accessionNo: e.accessionNo, // reuse from filing
  sequence: normalizeSequence(e.sequence),
  type: normalizeExhibitType(e.type),
  description: e.description?.trim() || undefined,
  filename: e.filename,
  exhibitUrl: buildExhibitUrl(cik, accessionNo, e.filename)
}))

// 5. Dedupe by (accessionNo, sequence) and stable sort
const deduplicated = dedupeAndSortExhibits(normalized)
```

**EDGAR Index Document Locations:**
- Single-document filings: `https://www.sec.gov/Archives/edgar/data/{cik}/{accession_compact}/index.html` (HTML table)
- XBRL filings: May include `filing-summary.xml` (XBRL index) or additional JSON manifests
- Fallback: Original submission text file (.txt) contains exhibit table in SGML format

**Example HTML Index Table Structure (observed from live EDGAR):**
```html
<table>
  <tr>
    <th>Sequence</th>
    <th>Description</th>
    <th>Document</th>
    <th>Type</th>
    <th>Size</th>
  </tr>
  <tr>
    <td>1</td>
    <td>Employment Agreement with CEO</td>
    <td><a href="d123_ex10-1.htm">d123_ex10-1.htm</a></td>
    <td>EX-10.1</td>
    <td>45 K</td>
  </tr>
  <!-- More rows ... -->
</table>
```

### Pattern 2: Exhibit Normalization as Pure Functions

**What:** Similar to Phase 2, implement each normalization rule (sequence trimming, type case/punctuation, description clean) as pure, testable functions.

**When to use:** Before building identity keys or returning `ExhibitRef[]` to caller.

**Example:**
```typescript
// src/exhibits/normalization.ts

/**
 * Sequence normalization: trim whitespace, validate numeric string.
 * Handles: "1", "  2  ", "0001".
 */
export function normalizeSequence(input: string): string {
  const trimmed = input.trim()
  if (!/^\d+$/.test(trimmed)) {
    throw new NormalizationError(`Invalid sequence: ${input}`, { input })
  }
  return trimmed
}

/**
 * Exhibit type normalization: uppercase, normalize punctuation.
 * Handles: "ex-10.1", "EX_10.1", "EX/10.1", "EX-10.01".
 */
export function normalizeExhibitType(input: string): string {
  const cleaned = input.trim().toUpperCase()
  // Normalize separators: EX_10 → EX-10, EX/10 → EX-10
  const normalized = cleaned.replace(/[_\/]/g, "-")
  if (!/^EX-\d+(\.\d+)?([A-Z])?$/.test(normalized)) {
    throw new NormalizationError(`Invalid exhibit type: ${input}`, { input })
  }
  return normalized
}

/**
 * Description normalization: trim, convert empty to undefined.
 */
export function normalizeDescription(input?: string): string | undefined {
  if (!input) return undefined
  const trimmed = input.trim()
  return trimmed.length > 0 ? trimmed : undefined
}
```

### Pattern 3: EX-10* Contract Matching

**What:** Implement a pure function that returns `true` if a normalized exhibit type matches any `EX-10*` variant.

**When to use:** Filtering exhibits for contract-specific workflows (`listContractExhibits`).

**Example:**
```typescript
// src/exhibits/filters/contract.ts

export function isContractExhibit(normalizedType: string): boolean {
  // Normalized type is uppercase with hyphens: "EX-10", "EX-10.1", "EX-10.2", "EX-10A", etc.
  return /^EX-10(\.\d+|[A-Z])?$/.test(normalizedType)
}

// Usage:
const contractExhibits = exhibits.filter(e => isContractExhibit(e.type))
```

### Pattern 4: Exhibit Dedup and Sort (Filing-Local)

**What:** Within a filing, dedupe exhibits by `(accessionNo, sequence)` identity, sort by sequence ascending, then filename ascending.

**When to use:** Before returning `ExhibitRef[]` to caller; ensures deterministic local order.

**Example:**
```typescript
// src/exhibits/deduplication.ts

export function dedupeAndSortExhibits(
  exhibits: ExhibitRef[]
): ExhibitRef[] {
  const identityMap = new Map<string, ExhibitRef>()

  for (const exhibit of exhibits) {
    const identity = `${exhibit.accessionNo}:${exhibit.sequence}`
    if (!identityMap.has(identity)) {
      identityMap.set(identity, exhibit)
    }
  }

  const deduplicated = Array.from(identityMap.values())

  return deduplicated.sort((a, b) => {
    // Primary: sequence ascending (numeric comparison)
    const seqA = Number(a.sequence)
    const seqB = Number(b.sequence)
    if (seqA !== seqB) return seqA - seqB

    // Secondary: filename ascending (string comparison)
    return a.filename.localeCompare(b.filename)
  })
}
```

### Anti-Patterns to Avoid

- **Missing filing index fetch:** Don't assume exhibit data is available elsewhere; must fetch and parse from archive URL.
- **Inconsistent sequence normalization:** Don't store "001" and "1" as different sequences; normalize before dedupe.
- **Case-sensitive type matching:** Don't use "ex-10.1" !== "EX-10.1"; always uppercase before comparing.
- **Forgotten exhibit URLs:** Don't skip building `exhibitUrl`; provenance is required in `ExhibitRef`.
- **Sorting by filename only:** Don't omit numeric sequence sort; `EX-10.2` must come after `EX-10.1` even if filenames vary.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filing index HTML table extraction | Custom regex-based table parsing | DOMParser (web-standard) or structured extraction helper | HTML tables vary in format; DOMParser handles whitespace, nested tags, missing cells gracefully |
| Exhibit type variant normalization (EX_10 vs EX-10 vs EX/10) | Ad-hoc string replacement | Dedicated `normalizeExhibitType()` function with explicit regex pattern | Exhibit type formats have specific grammar; centralized function prevents subtle matching bugs |
| Contract exhibit matching (EX-10 detection) | Manual string contains/startsWith checks | Dedicated `isContractExhibit(type)` pure function with regex | Contract filter must match all variants (EX-10, EX-10.1, EX-10A, etc.); single source of truth |
| Exhibit URL construction | String concatenation without validation | Helper function that validates CIK, accession, filename before building URL | Malformed URLs break downstream consumers; centralized helper ensures consistency |
| Exhibit sequence numeric comparison | String `.localeCompare()` only | Parse to `Number()` for primary sort, then string for secondary | "10" !== "2" lexicographically; must sort numerically first |

**Key insight:** Exhibit enumeration touches several error-prone domains (HTML parsing, type normalization, URL building, numeric sequence sorting). Each has edge cases. Implement each as a pure, tested function; compose in exhibit service layer.

---

## Common Pitfalls

### Pitfall 1: Missing Filing Index Fetch

**What goes wrong:** You assume exhibit data is available in the Submissions API (Phase 2). But the Submissions API only returns filing metadata (form, date, accession). To get exhibit details (sequence, type, description, filename, URL), you must fetch the filing index document from the archive URL. If you skip this step, `listExhibits` returns empty or incomplete results.

**Why it happens:** Phase 2 discovery doesn't fetch filing index documents; it only fetches submissions metadata. Exhibit enumeration requires an additional HTTP request per filing.

**How to avoid:**
1. Document the additional HTTP request requirement in `ExhibitService`.
2. Implement separate `fetchFilingIndex()` method that constructs archive URL and fetches HTML/JSON.
3. Test with fixtures containing real EDGAR filing index structure.

**Warning signs:**
- `listExhibits` returns empty array even for filings known to have exhibits.
- No HTTP call to `www.sec.gov/Archives/edgar/data/` in request logs.

### Pitfall 2: Inconsistent Exhibit Type Normalization

**What goes wrong:** Filing index uses "EX-10.1" (hyphenated), but some legacy filings use "EX_10.1" (underscore) or "EX/10.1" (slash). Your normalizer doesn't handle all three variants. Results: dedupe fails, type matching fails, consumer code gets inconsistent types.

**Why it happens:** SEC EDGAR allows multiple exhibit type formats. String-only comparisons without normalization create identity key collisions.

**How to avoid:**
1. Implement `normalizeExhibitType()` to map all three separators (`-`, `_`, `/`) to canonical hyphen form.
2. Test with fixtures containing all three variants; verify normalized output is identical.
3. Assert type matches regex pattern before storing.

**Warning signs:**
- Duplicate exhibits in output despite dedup code.
- Contract filter missing exhibits with underscore/slash notation.
- Tests pass with hyphens but fail with underscores.

### Pitfall 3: Numeric Sequence Sorting Error

**What goes wrong:** You sort exhibits by sequence using string comparison only: `"2".localeCompare("10")` returns 1 (2 comes after 10), causing `EX-10.2` to sort after `EX-10.10`. Result: exhibits returned in wrong order; caller logic breaks.

**Why it happens:** Sequence field is returned as string; lexicographic sort differs from numeric sort for multi-digit numbers.

**How to avoid:**
1. Parse sequence to `Number()` for primary sort comparison.
2. Keep secondary sort (filename) as string comparison.
3. Test with sequences like 1, 2, 10, 11; verify output order is numeric ascending.

**Warning signs:**
- Exhibit order varies across invocations or systems.
- "EX-10.10" appears before "EX-10.2" in output.

### Pitfall 4: Missing Exhibit URL Construction

**What goes wrong:** You parse exhibits from index, build `ExhibitRef` records, but skip `exhibitUrl` field or use malformed URL. Downstream code tries to download exhibit and gets 404 because URL is incomplete.

**Why it happens:** URL construction feels optional (exhibits have filenames), so it's deferred or skipped. But `ExhibitRef` contract includes `exhibitUrl` as a required field for provenance.

**How to avoid:**
1. After normalization, construct exhibit URL using pattern: `https://www.sec.gov/Archives/edgar/data/{cik}/{accession_compact}/{filename}`.
2. Validate constructed URL matches expected pattern before storing.
3. Test URL accessibility (optional: live-smoke test).

**Warning signs:**
- `exhibitUrl` field is empty or null in returned `ExhibitRef`.
- Downstream download code fails with 404 on constructed URL.

### Pitfall 5: Case Sensitivity in Contract Filter

**What goes wrong:** Filing index has exhibit type "ex-10.1" (lowercase), but your contract filter checks `type === "EX-10.1"` (uppercase). Filter rejects valid contract exhibits.

**Why it happens:** Normalization is implemented but not applied before filtering, or normalization is applied inconsistently.

**How to avoid:**
1. Always normalize exhibit type BEFORE building identity keys or applying filters.
2. Implement contract filter against normalized types: `isContractExhibit(normalizeExhibitType(rawType))`.
3. Test filter with lowercase, uppercase, mixed-case input.

**Warning signs:**
- Contract filter rejects exhibits you know are EX-10*.
- Filter results vary depending on case of input type.

### Pitfall 6: Pagination Across Multiple Exhibits (if implemented later)

**What goes wrong:** A filing has 1000+ exhibits. Filing index document is large and requires pagination/truncation handling. If you don't implement multi-page exhibit fetching, results are incomplete.

**Why it happens:** For v1, assume single index document per filing (rare to exceed 1000 exhibits in one filing). But if future phases add batch requests or large filing support, exhibit pagination becomes a concern.

**How to avoid:**
1. Document assumption in code: "v1 assumes single index document per filing."
2. Add test case with large fixture (simulated 1000+ exhibits).
3. If pagination appears in live data, log warning and mark as future work.

**Warning signs:**
- Exhibit count matches index document truncation point (e.g., always 100 exhibits).
- Test cases don't cover high-volume exhibit scenarios.

---

## Code Examples

Verified patterns from SEC EDGAR ecosystem and Phase 2 codebase:

### Example 1: Filing Index URL Construction

```typescript
// Source: SEC EDGAR archive structure
// https://www.sec.gov/Archives/edgar/data/{cik}/{accession_compact}/

export function buildFilingIndexUrl(cik: string, accessionNo: string): string {
  // cik: "0000320193" (normalized to 10 digits)
  // accessionNo: "0000000000-20-000000" (canonical hyphenated)
  const accessionCompact = accessionNo.replace(/-/g, "")
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionCompact}/index.html`
}

// Alternative: JSON index (newer filings)
export function buildFilingIndexJsonUrl(cik: string, accessionNo: string): string {
  const accessionCompact = accessionNo.replace(/-/g, "")
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accessionCompact}/index.json`
}
```

### Example 2: HTML Filing Index Parsing

```typescript
// Source: DOM parsing patterns (web-standard DOMParser)
// Handles HTML exhibit tables from EDGAR archives

export async function parseExhibitTableFromHtml(
  htmlContent: string
): Promise<Array<{
  sequence: string
  filename: string
  type: string
  description?: string
}>> {
  // Use DOMParser (Node 19+, Bun, browser)
  const doc = new (globalThis.DOMParser || require("jsdom").JSDOM).parseHTML(htmlContent)
  const table = doc.querySelector("table")

  if (!table) {
    throw new ParseError("No exhibit table found in index document", { content: htmlContent.slice(0, 100) })
  }

  const results: Array<{ sequence: string; filename: string; type: string; description?: string }> = []

  // Parse table rows (skip header)
  const rows = Array.from(table.querySelectorAll("tbody > tr"))
  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll("td"))
    if (cells.length < 4) continue // Skip malformed rows

    const sequence = cells[0]?.textContent?.trim() || ""
    const description = cells[1]?.textContent?.trim()
    const filenameCell = cells[2]?.querySelector("a")
    const filename = filenameCell?.getAttribute("href") || filenameCell?.textContent?.trim() || ""
    const type = cells[3]?.textContent?.trim() || ""

    if (!sequence || !filename || !type) continue

    results.push({
      sequence,
      filename: filename.split("/").pop() || filename, // Extract basename
      type,
      description: description && description.length > 0 ? description : undefined,
    })
  }

  return results
}
```

### Example 3: Exhibit Type Normalization and Contract Matching

```typescript
// Source: Data model specification + contract filter requirements

export function normalizeExhibitType(input: string): string {
  const cleaned = input.trim().toUpperCase()
  const normalized = cleaned.replace(/[_\/]/g, "-")

  // Validate against expected pattern
  if (!/^EX-\d+(\.\d+|[A-Z])?$/.test(normalized)) {
    throw new NormalizationError(`Invalid exhibit type after normalization: ${input}`, { input, normalized })
  }

  return normalized
}

export function isContractExhibit(normalizedType: string): boolean {
  // Matches: EX-10, EX-10.1, EX-10.2, EX-10A, EX-10.01, etc.
  return /^EX-10(\.\d+|[A-Z])?$/.test(normalizedType)
}

// Usage:
const rawType = "ex_10.1"
const normalized = normalizeExhibitType(rawType) // "EX-10.1"
const isContract = isContractExhibit(normalized) // true
```

### Example 4: Exhibit Dedup and Deterministic Sort

```typescript
// Source: Phase 2 dedup + sort patterns applied to exhibits

export function dedupeAndSortExhibits(exhibits: ExhibitRef[]): ExhibitRef[] {
  // Build identity map: "{accessionNo}:{sequence}" → first occurrence
  const identityMap = new Map<string, ExhibitRef>()

  for (const exhibit of exhibits) {
    const identity = `${exhibit.accessionNo}:${exhibit.sequence}`
    if (!identityMap.has(identity)) {
      identityMap.set(identity, exhibit)
    }
  }

  const deduplicated = Array.from(identityMap.values())

  // Sort: sequence numeric ascending, then filename string ascending
  return deduplicated.sort((a, b) => {
    // Primary: sequence (numeric)
    const seqA = Number(a.sequence)
    const seqB = Number(b.sequence)
    if (seqA !== seqB) return seqA - seqB

    // Secondary: filename (string)
    return a.filename.localeCompare(b.filename)
  })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Scraping EDGAR HTML exhibit tables with fragile regex | DOM-based parsing with DOMParser (Node 19+, web-standard) | 2020+ (Node modernization) | More reliable, fewer edge cases, web-standard API |
| Per-filing sequential requests without rate limiting | SecHttpClient rate limiter applies uniformly | Phase 1 (HTTP client) | Compliant with SEC request caps; prevents bans |
| Manual type matching (contains "10") | Explicit `EX-10*` regex pattern with variant support | Phase 3 (this phase) | Accurate contract detection, handles all variants |
| Ad-hoc exhibit URL construction | Helper function with validation | Phase 3 (this phase) | Consistent provenance; prevents downstream 404s |

**Deprecated/outdated:**
- Regex-only HTML parsing: Too fragile for variable EDGAR table structures; DOMParser is standard now.
- Substring matching for exhibit types: Error-prone; regex patterns are precise.

---

## Open Questions

1. **Filing index format variability across EDGAR eras**
   - What we know: Index documents are available as HTML tables (universal) or XML/JSON (newer). Phase 2 research confirmed HTML is most reliable.
   - What's unclear: What is the earliest filing with exhibit data? Are there significant format changes between 1990s and 2020s that would break parsing?
   - Recommendation: Assume HTML index is universal back to 1994. If live-smoke tests reveal parsing failures on old filings, implement fallback parsing strategy. Mark as LOW-priority future work.

2. **Exhibit URL path variations**
   - What we know: URL pattern is `https://www.sec.gov/Archives/edgar/data/{cik}/{accession_compact}/{filename}`.
   - What's unclear: Are there edge cases where filename contains path separators or special characters that break URL construction?
   - Recommendation: Test URL construction with real EDGAR filenames (some include hyphens, underscores, dots). If failures occur, implement URL-safe encoding helper.

3. **XBRL exhibit metadata vs. HTML index**
   - What we know: Newer XBRL filings (10-K, 10-Q) have structured exhibit metadata in XML.
   - What's unclear: Should Phase 3 support both HTML index AND XBRL parsing, or defer XBRL to Phase 4?
   - Recommendation: For v1, support HTML index only (universal, simpler). XBRL parsing deferred to future phase per architecture (parsing concerns out of library scope).

4. **Exhibit metadata completeness guarantees**
   - What we know: `ExhibitRef` requires `accessionNo`, `sequence`, `type`, `filename`, `exhibitUrl`.
   - What's unclear: What if filing index omits optional fields like `description`? Should we reject or allow partial records?
   - Recommendation: Allow `description` to be optional (current API contract). Reject records missing required fields with typed error. Test with fixtures missing descriptions.

5. **Performance with high-exhibit filings**
   - What we know: Most filings have < 100 exhibits; rare filings approach 1000+.
   - What's unclear: Is streaming/pagination required for v1, or is single-fetch acceptable?
   - Recommendation: Assume single-fetch per filing for v1. If performance testing shows bottleneck, implement streaming in Phase 4. Document assumption in code.

---

## Sources

### Primary (HIGH confidence)
- **SEC EDGAR Archive Structure** - Verified URLs and filing index document locations (`https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/`) from live EDGAR access
- **edgar-ts-data-model.md** - Normalization rules (sequence trimming, type uppercase + punctuation, description clean) and dedupe identity key (accessionNo:sequence)
- **edgar-ts-api-contract.md** - Locked `ExhibitRef` type contract with required fields (accessionNo, sequence, type, description, filename, exhibitUrl)
- **edgar-ts-architecture.md** - ExhibitService module responsibilities and exhibit filter strategy
- **ADR-003 (Exhibit Filtering and Dedupe Identity)** - Contract filter decision (`EX-10*` only in v1) and identity key strategy
- **Phase 2 Implementation (DiscoveryService)** - Normalization, dedup, and sort patterns reused for exhibits

### Secondary (MEDIUM confidence)
- [SEC.gov | Accessing EDGAR Data](https://www.sec.gov/search-filings/edgar-search-assistance/accessing-edgar-data) - Confirms index file formats (HTML, XML, JSON) and archive structure
- [SEC.gov | EDGAR Application Programming Interfaces](https://www.sec.gov/search-filings/edgar-application-programming-interfaces) - Confirms Submissions API metadata structure (no exhibit enumeration endpoint)
- [Adams on Contract Drafting: Retrieving Contracts from EDGAR](https://www.adamsdrafting.com/an-update-on-retrieving-contracts-from-the-secs-edgar-system/) - High-level overview of exhibit retrieval workflow and EX-10 contract location
- [sec-api.io: SEC EDGAR Form Types & Filing Exhibits](https://sec-api.io/list-of-sec-filing-types) - Confirms exhibit labeling conventions (EX-10.1, EX-10.2, etc.) and sequential naming
- [GitHub: janlukasschroeder/sec-api-python](https://github.com/janlukasschroeder/sec-api-python) - Community-verified exhibit parsing patterns and metadata field names

### Tertiary (LOW confidence - requires validation)
- XBRL filing-summary.xml parsing (deferred to Phase 4) - Referenced in search but not primary recommendation for v1; would require separate XML parsing pipeline
- Daily index file exhibit metadata - Available in daily-index but less structured than HTML; noted as alternative if archive HTML parsing fails

---

## Metadata

**Confidence breakdown:**
- **Standard stack:** HIGH - Filing index documents are SEC's official exhibit source; HTML parsing via DOMParser is web-standard; no external dependencies required.
- **Architecture:** HIGH - ExhibitService pattern is locked in architecture spec; normalization and dedup rules are in locked data model; contract filter is in ADR-003.
- **Pitfalls:** MEDIUM-HIGH - Pitfalls 1-4 confirmed by ecosystem patterns (sec-api-python, edgartools); Pitfalls 5-6 extrapolated from general software practices.
- **Exhibit URL construction:** MEDIUM - Pattern verified from live EDGAR archive structure; edge cases (special characters in filenames) should be validated empirically.

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days; EDGAR archive structure is stable; confidence decreases if live exhibit fetches reveal unexpected index format variations)
