# Plan: edgar-ts Enhancements for EDGAR Ingestion System

> Source PRD: ourfirmai/ourfirm-ai-edgar-ingestion#1 — "edgar-ts Enhancement Scope" section

## Architectural decisions

Durable decisions that apply across all phases:

- **Module pattern**: Each new capability follows `src/<module>/service.ts` + `src/<module>/types.ts`, exposed through the `EdgarClient` facade in `src/client.ts`. Public types re-exported from `src/types/index.ts`.
- **HTTP layer**: All HTTP requests go through `SecHttpClient` (rate limiting at 10 req/s, exponential backoff retry with jitter, timeout via AbortSignal, telemetry hooks). No direct `fetch` calls in service code.
- **Error handling**: All new errors extend `EdgarError` with the `retryable` flag. New error types only where the existing taxonomy (ValidationError, TransportError, ParseError, NotFoundError, RateLimitedError, TimeoutError) is insufficient.
- **Telemetry**: Every new HTTP call includes `operation` (client method name) and `endpointClass` (SEC endpoint category) in telemetry events. New endpoint classes added as needed.
- **Zero runtime dependencies**: Must be maintained. ZIP handling uses Node's built-in `zlib`. No `axios`, `node-fetch`, `unzipper`, or similar.
- **Testing**: Vitest with fixture-based transport (mock HTTP responses, no live SEC calls in CI). Each phase includes unit tests for parsing/normalization and service-level tests with fixture transport. Live smoke tests gated behind environment flag.
- **Versioning**: Each phase ships as a minor version bump via changesets. Breaking changes (if any) require a major bump with migration notes.
- **Runtime**: Node.js 20+, Bun. Web-standard APIs preferred (fetch, AbortSignal, crypto.subtle, TextDecoder).
- **Normalization**: All SEC identifiers (CIK, accession numbers, form types) normalized to canonical format on output, consistent with existing normalization functions in `src/discovery/normalization.ts`.

---

## Phase 1: Company Metadata Exposure

**User stories**: US-5 (company metadata synced for querying), US-19 (look up company by CIK)

### What to build

The SEC Submissions API (`data.sec.gov/submissions/CIK{10}.json`) already returns company metadata — name, tickers, exchanges, SIC code, SIC description, entity type, state of incorporation, fiscal year end — but edgar-ts currently discards everything except the filing list. This phase surfaces that metadata through a new `CompanyInfo` type and `getCompanyInfo(cik)` method on `EdgarClient`.

The existing `DiscoveryService` already fetches the submissions response. This phase extracts company metadata from that response and exposes it as a separate code path. Optionally, `discoverFilings()` can return the company info alongside filings to avoid a redundant HTTP call when both are needed.

End-to-end: new `CompanyInfo` type → extend `DiscoveryService` (or new `CompanyService`) to extract metadata from submissions response → new `EdgarClient.getCompanyInfo()` method → tests with fixture submissions response → README update.

### Acceptance criteria

- [ ] `CompanyInfo` type defined with fields: cik, name, tickers, exchanges, sic, sicDescription, entityType, stateOfIncorporation, fiscalYearEnd
- [ ] `EdgarClient.getCompanyInfo(cik)` returns `CompanyInfo` for a valid CIK
- [ ] CIK is normalized (10-digit zero-padded) on both input and output
- [ ] `NotFoundError` thrown for non-existent CIK
- [ ] Telemetry events include `operation: 'getCompanyInfo'` and `endpointClass: 'submissions'`
- [ ] Unit tests for company metadata extraction from fixture submissions JSON
- [ ] Service-level test with fixture transport
- [ ] README updated with `getCompanyInfo()` usage example
- [ ] Changeset added for minor version bump

---

## Phase 2: Company/Ticker Lookup

**User stories**: US-4 (targeted ingestion by ticker), US-19 (look up company by ticker)

### What to build

The SEC publishes `company_tickers.json` at `sec.gov/files/company_tickers.json` — a mapping of all CIKs to tickers, company names, and exchanges. This phase adds a `lookupCompany()` method that resolves a ticker symbol or company name to a CIK, enabling users who think in tickers (e.g., "AAPL") to use the library without manually finding CIK numbers.

The lookup file is ~2MB and changes infrequently. The service should fetch it, parse it, and provide search methods. Caching strategy is left to the consumer (the file can be fetched once per session).

End-to-end: new `CompanyTicker` type → new `LookupService` → new `EdgarClient.lookupCompany(query)` method → tests with fixture tickers JSON → README update.

### Acceptance criteria

- [ ] `CompanyTicker` type defined with fields: cik, ticker, name, exchange
- [ ] `EdgarClient.lookupCompany(query)` accepts a ticker string or company name substring and returns matching `CompanyTicker[]`
- [ ] Ticker matching is case-insensitive and exact
- [ ] Company name matching is case-insensitive substring
- [ ] CIK output is normalized to 10-digit zero-padded format
- [ ] Empty array returned for no matches (not an error)
- [ ] Telemetry events include `operation: 'lookupCompany'` and `endpointClass: 'files'`
- [ ] Unit tests for ticker parsing, matching logic, CIK normalization
- [ ] Service-level test with fixture transport
- [ ] README updated with `lookupCompany()` usage example
- [ ] Changeset added for minor version bump

---

## Phase 3: Index File Discovery + CIK-less Discovery

**User stories**: US-1 (backfill from 1995), US-3 (daily sync), US-11 (parse index files for bulk discovery)

### What to build

This is the largest and most important enhancement. The SEC publishes quarterly and daily index files at `sec.gov/Archives/edgar/full-index/` and `sec.gov/Archives/edgar/daily-index/`. Each directory contains `master.idx` — a pipe-delimited flat file listing every filing for that period: `CIK|Company Name|Form Type|Date Filed|Filename`.

This phase adds an `IndexService` that can:
1. Fetch and parse quarterly index files (`/full-index/{year}/QTR{n}/master.idx`)
2. Fetch and parse daily index files (`/daily-index/{year}/QTR{n}/master{YYYYMMDD}.idx` or `/full-index/{year}/QTR{n}/master.idx` for the current quarter)
3. Return normalized `FilingRef[]` from index entries, consistent with existing discovery output

This phase also removes the `ConfigurationError` that `discoverFilings()` currently throws when no CIK is provided. Instead, CIK-less discovery uses index files: `discoverFilings({ from, to })` without a CIK fetches the relevant index files for the date range and returns all filings.

The index file parser must handle:
- Header lines (first ~11 lines are metadata/dashes, not data)
- Pipe-delimited format: `CIK|Company Name|Form Type|Date Filed|Filename`
- Filename field contains the relative path to the filing (e.g., `edgar/data/320193/0001193125-20-123456.txt`)
- Quarterly files can be large (100K+ lines for recent quarters)

End-to-end: new index entry types → `IndexService` (fetch + parse + normalize) → extend `DiscoveryService` to support CIK-less discovery via index files → modify `EdgarClient.discoverFilings()` to accept optional CIK → new `EdgarClient.discoverFilingsByIndex()` for explicit index file access → tests with fixture index files → README update.

### Acceptance criteria

- [ ] `EdgarClient.discoverFilingsByIndex(options)` fetches and parses quarterly/daily master.idx files for a given date range
- [ ] Index file parser correctly skips header lines and parses pipe-delimited data rows
- [ ] Output is normalized `FilingRef[]` consistent with existing CIK-based discovery output (same type, same normalization)
- [ ] Form type filtering works on index file results (optional `formTypes` parameter)
- [ ] Date range spanning multiple quarters fetches all relevant quarterly index files
- [ ] `EdgarClient.discoverFilings({ from, to })` without a CIK no longer throws `ConfigurationError` — it uses index file discovery
- [ ] `EdgarClient.discoverFilings({ from, to, cik })` with a CIK still uses the per-CIK Submissions API (existing behavior unchanged)
- [ ] Deduplication applied to index file results (same identity rules as existing discovery)
- [ ] Telemetry events include `operation: 'discoverFilingsByIndex'` and `endpointClass: 'full-index'` or `'daily-index'`
- [ ] Rate limiting respected when fetching multiple index files sequentially
- [ ] Unit tests for index file parsing (header skipping, pipe parsing, edge cases)
- [ ] Unit tests for date-range-to-quarterly-index-URL mapping
- [ ] Service-level tests with fixture index files
- [ ] Integration test: CIK-less discoverFilings delegates to index discovery
- [ ] README updated with index file discovery examples
- [ ] Changeset added for minor version bump

---

## Phase 4: Bulk Data Downloads

**User stories**: US-5 (company metadata from submissions.zip)

### What to build

The SEC publishes nightly bulk data files: `submissions.zip` (all company submission metadata) and `companyfacts.zip` (all XBRL facts). These are more efficient than per-CIK API calls for initial data loading.

This phase adds methods to download and parse these bulk ZIP files. The main challenge is the zero-dependency constraint — ZIP decompression must use Node's built-in `zlib` (for deflate streams) and manual ZIP format parsing, or the ZIP entries can be accessed via the central directory without a full ZIP library.

`submissions.zip` contains one JSON file per CIK (same format as the Submissions API response). `companyfacts.zip` contains one JSON file per CIK (same format as the Company Facts API response, added in Phase 5).

This phase focuses on `submissions.zip` parsing since it's needed for company metadata bulk loading. `companyfacts.zip` support can be added after Phase 5 (XBRL).

End-to-end: ZIP stream parser using built-in zlib → `BulkDataService` → new `EdgarClient.downloadSubmissionsBulk()` returning an async iterator of `CompanyInfo` (or submissions data) → tests with fixture ZIP → README update.

### Acceptance criteria

- [ ] `EdgarClient.downloadSubmissionsBulk()` downloads `submissions.zip` and yields parsed company/submission data
- [ ] ZIP decompression uses only Node built-in APIs (zlib, Buffer) — no runtime dependencies added
- [ ] Output yields `CompanyInfo` objects (reusing Phase 1 type) for each CIK in the archive
- [ ] Streaming/iterator pattern used — does not load entire ZIP into memory (file is ~2GB)
- [ ] Progress telemetry emitted (entries processed count)
- [ ] Telemetry events include `operation: 'downloadSubmissionsBulk'` and `endpointClass: 'bulk-data'`
- [ ] Graceful handling of malformed entries (skip and log, don't abort)
- [ ] Unit tests for ZIP entry parsing with small fixture ZIP
- [ ] Service-level test with fixture transport
- [ ] README updated with bulk download usage example
- [ ] Changeset added for minor version bump

---

## Phase 5: XBRL API Wrapping

**User stories**: (Future analytics phase — "all of the EDGAR data")

### What to build

The SEC provides structured financial data via XBRL REST APIs at `data.sec.gov/api/xbrl/`. This phase wraps three endpoints:

1. **Company Facts** (`/api/xbrl/companyfacts/CIK{10}.json`) — all XBRL facts for a company across all filings. Returns taxonomy, tag, unit, and time-series of values.
2. **Company Concept** (`/api/xbrl/companyconcept/CIK{10}/{taxonomy}/{tag}.json`) — single concept time series for a company (e.g., us-gaap/Revenue over all filings).
3. **Frames** (`/api/xbrl/frames/{taxonomy}/{tag}/{unit}/{period}.json`) — cross-company comparison for one concept at a point in time (e.g., Revenue for all companies in CY2024Q1).

This is Layer 1 wrapping only — typed HTTP access to the raw API responses. No concept normalization (mapping different tags to canonical metrics). That is an ingestion-repo concern.

End-to-end: new XBRL types (CompanyFacts, CompanyConcept, Frame, XbrlFact) → new `XbrlService` → new `EdgarClient.getCompanyFacts()`, `getCompanyConcept()`, `getFrame()` methods → tests with fixture XBRL responses → README update.

### Acceptance criteria

- [ ] `EdgarClient.getCompanyFacts(cik)` returns typed `CompanyFacts` with all taxonomies, tags, units, and fact values
- [ ] `EdgarClient.getCompanyConcept(cik, taxonomy, tag)` returns typed `CompanyConcept` with time-series values
- [ ] `EdgarClient.getFrame(taxonomy, tag, unit, period)` returns typed `Frame` with cross-company values
- [ ] Supported taxonomies: `us-gaap`, `ifrs-full`, `dei`, `srt`
- [ ] Period format validated: `CY{year}` (annual), `CY{year}Q{n}` (quarterly), `CY{year}Q{n}I` (instantaneous)
- [ ] CIK normalized on input, all identifiers normalized on output
- [ ] `NotFoundError` for non-existent CIK or concept
- [ ] Telemetry events include appropriate `operation` and `endpointClass: 'xbrl'`
- [ ] Unit tests for response parsing and type mapping
- [ ] Service-level tests with fixture XBRL JSON responses
- [ ] README updated with XBRL usage examples
- [ ] Changeset added for minor version bump

---

## Phase 6: EFTS Full-Text Search

**User stories**: (Future search phase — "searchable")

### What to build

The SEC operates a full-text search engine at `efts.sec.gov/LATEST/search-index` (Elasticsearch-based, undocumented but reverse-engineered from the SEC's EDGAR search UI at `sec.gov/edgar/search/`). This phase wraps it with typed query/response types.

The EFTS API supports:
- Keyword and phrase search (`q` parameter)
- Form type filter (`forms` parameter)
- Date range filter (`dateRange`, `startdt`, `enddt`)
- Company/CIK filter (`entity`)
- Pagination (up to 10,000 results, 50 per page)
- Sort by relevance or date

This is an undocumented API — it could change without notice. The implementation should be defensive (graceful degradation on unexpected response shapes) and clearly documented as unofficial.

End-to-end: new search types (SearchQuery, SearchResult, SearchHit) → new `SearchService` → new `EdgarClient.searchFilings(query)` method → tests with fixture search responses → README update with caveat about unofficial API.

### Acceptance criteria

- [ ] `EdgarClient.searchFilings(query)` accepts keyword/phrase, optional form types, date range, CIK/entity filter
- [ ] Returns typed `SearchResult` with hits (filing metadata + text snippets), total count, pagination info
- [ ] Pagination support via `from` parameter (or page-based abstraction)
- [ ] Form type filter accepts string array (e.g., `['10-K', '8-K']`)
- [ ] Date range accepts `from`/`to` in YYYY-MM-DD format
- [ ] `ParseError` thrown (not retried) if response shape is unrecognizable (API changed)
- [ ] Telemetry events include `operation: 'searchFilings'` and `endpointClass: 'efts'`
- [ ] README documents this as an unofficial/undocumented API with stability caveat
- [ ] Unit tests for query parameter construction and response parsing
- [ ] Service-level tests with fixture search response
- [ ] Changeset added for minor version bump
