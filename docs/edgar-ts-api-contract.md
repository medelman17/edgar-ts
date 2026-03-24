# edgar-ts API Contract

**Date:** 2026-03-24
**Status:** Contract locked for v1

## Public Surface

```ts
export type EdgarClientOptions = {
  userAgent: string;
  maxRequestsPerSecond?: number; // default 8
  timeoutMs?: number; // default 10000
  retries?: {
    maxAttempts: number; // default 3
    baseDelayMs: number; // default 250
    maxDelayMs: number; // default 4000
  };
  telemetry?: {
    onRequestStart?: (event: RequestStartEvent) => void;
    onRequestEnd?: (event: RequestEndEvent) => void;
    onRetry?: (event: RetryEvent) => void;
  };
};

export type DiscoverFilingsInput = {
  from: string; // YYYY-MM-DD
  to: string;   // YYYY-MM-DD
  cik?: string;
  formTypes?: string[];
};

export type FilingRef = {
  cik: string;
  accessionNo: string;
  formType: string;
  filingDate: string; // YYYY-MM-DD
  filingUrl: string;
};

export type ExhibitRef = {
  accessionNo: string;
  sequence: string;
  type: string;
  description?: string;
  filename: string;
  exhibitUrl: string;
};

export type DownloadedExhibit = {
  exhibit: ExhibitRef;
  bytes: Uint8Array;
  mimeType?: string;
  sizeBytes: number;
  sha256: string;
};

export type CompanyInfo = {
  cik: string;
  name: string;
  tickers: string[];
  exchanges: string[];
  entityType?: string;
  sic?: string;
  sicDescription?: string;
  stateOfIncorporation?: string;
  fiscalYearEnd?: string;
};

export type CompanyTicker = {
  cik: string;
  ticker: string;
  name: string;
  exchange: string;
};

export type BulkDownloadResult = {
  bytes: Uint8Array;
  sizeBytes: number;
  mimeType?: string;
  source: "submissions" | "companyfacts";
};

export type SearchQuery = {
  q: string;
  formTypes?: string[];
  from?: string;
  to?: string;
  entity?: string;
  start?: number;
};

export type SearchResult = {
  total: number;
  hits: SearchHit[];
};

export type SearchHit = {
  id: string;
  entityName: string;
  fileNumber?: string;
  formType: string;
  fileDate: string;
  fileDescription?: string;
  periodOfReport?: string;
  score: number;
};

// XBRL types — see src/xbrl/service.ts for CompanyFacts, CompanyConcept, Frame

export declare class EdgarClient {
  constructor(options: EdgarClientOptions);

  // Company data
  getCompanyInfo(cik: string): Promise<CompanyInfo>;
  lookupCompany(query: string): Promise<CompanyTicker[]>;

  // Filing discovery
  discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]>;

  // Exhibits
  listExhibits(filing: FilingRef): Promise<ExhibitRef[]>;
  listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]>;
  downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit>;

  // Bulk data
  downloadSubmissionsBulk(): Promise<BulkDownloadResult>;
  downloadCompanyFactsBulk(): Promise<BulkDownloadResult>;

  // XBRL financials
  getCompanyFacts(cik: string): Promise<CompanyFacts>;
  getCompanyConcept(cik: string, taxonomy: string, tag: string): Promise<CompanyConcept>;
  getFrame(taxonomy: string, tag: string, unit: string, period: string): Promise<Frame>;

  // Full-text search (unofficial EFTS API)
  searchFilings(query: SearchQuery): Promise<SearchResult>;
}
```

## Method Contracts

## `new EdgarClient(options)`
1. Requires non-empty `userAgent`.
2. Applies default options when unset.
3. Throws `ConfigurationError` for invalid options.

## `getCompanyInfo(cik)`
1. Normalizes CIK to 10-digit zero-padded format.
2. Fetches SEC Submissions API for company metadata.
3. Returns `CompanyInfo` with all available fields; optional fields may be undefined.
4. Throws `ValidationError` for invalid CIK, `NotFoundError` for non-existent CIK.

## `lookupCompany(query)`
1. Fetches SEC `company_tickers.json` (~2MB, ~13K entries) on each call.
2. Matches by exact ticker (case-insensitive) first, then by company name substring.
3. Returns ticker matches before name matches.
4. Returns empty array for no matches.
5. No caching — callers should re-use results for multiple lookups.

## `discoverFilings(input)`
1. Validates date format and range.
2. If `cik` provided: uses SEC Submissions API (per-CIK, includes pagination).
3. If `cik` omitted: uses SEC quarterly index files (`master.idx`) for broad discovery across all filers.
4. If `formTypes` omitted, applies core default forms (8-K, 10-K, 10-Q, 20-F, S-1 + amendments).
5. Returns deduplicated and stable-sorted `FilingRef[]`.
6. Throws typed errors for validation, transport, and normalization failures.

## `listExhibits(filing)`
1. Requires canonical filing identity fields.
2. Returns all normalized exhibits in deterministic order.
3. Does not apply contract filtering.

## `listContractExhibits(filing)`
1. Equivalent to `listExhibits` + built-in contract filter.
2. Includes only records matching `EX-10*` rule.
3. Returns empty array when no matches.

## `downloadExhibit(exhibit)`
1. Fetches raw bytes from `exhibit.exhibitUrl`.
2. Returns hash and metadata.
3. Throws non-retryable not-found error for permanent missing objects.
4. Throws retryable transport errors for transient failures.

## `downloadSubmissionsBulk()` / `downloadCompanyFactsBulk()`
1. Downloads the SEC nightly bulk archive as raw bytes.
2. Returns `Uint8Array` — ZIP extraction is the caller's responsibility.
3. `submissions.zip` is ~2GB; `companyfacts.zip` varies. Callers may need to increase `--max-old-space-size`.

## `getCompanyFacts(cik)`
1. Returns all XBRL facts across all filings for a company.
2. Organized by taxonomy (us-gaap, ifrs-full, dei, srt), then by tag, then by unit.

## `getCompanyConcept(cik, taxonomy, tag)`
1. Returns time-series values for a single XBRL concept (e.g., us-gaap/Revenue).
2. Organized by unit (USD, shares, etc.) with fiscal year, period, and form metadata.

## `getFrame(taxonomy, tag, unit, period)`
1. Returns cross-company values for one concept at a point in time.
2. Period format: `CY{year}` (annual), `CY{year}Q{n}` (quarterly), `CY{year}Q{n}I` (instantaneous).

## `searchFilings(query)`
1. Wraps SEC EFTS Elasticsearch API (undocumented, may change without notice).
2. Supports keyword/phrase search, form type filter, date range, entity/CIK filter.
3. Pagination via `start` parameter (0-indexed offset).
4. Maximum 10,000 results per query (SEC limitation).
5. Throws `ParseError` if response format is unrecognizable (API changed).

## Defaults
1. `maxRequestsPerSecond`: `8`
2. `timeoutMs`: `10000`
3. `retries.maxAttempts`: `3`
4. `retries.baseDelayMs`: `250`
5. `retries.maxDelayMs`: `4000`
6. `formTypes default`:
- `8-K`
- `10-K`
- `10-Q`
- `20-F`
- `S-1`
- relevant amendment variants

## Input Validation Rules
1. `from` and `to` must be ISO calendar date strings (`YYYY-MM-DD`).
2. `from` must be <= `to`.
3. `cik` must normalize to 10-digit zero-padded numeric value internally.
4. URLs must be valid absolute URLs.

## Error Contract
All public methods reject with `EdgarError` subclasses.

Common shape:
```ts
type EdgarErrorShape = {
  name: string;
  code: string;
  message: string;
  retryable: boolean;
  cause?: unknown;
  metadata?: Record<string, unknown>;
};
```

## Semver Policy
1. Additive optional fields in output types are minor releases.
2. Method signature changes are major releases.
3. Default behavior changes are major unless explicitly behind opt-in options.

## Behavioral Guarantees
1. Deterministic ordering and normalization for same upstream data.
2. No persistence side effects.
3. No hidden global mutable state across client instances.
