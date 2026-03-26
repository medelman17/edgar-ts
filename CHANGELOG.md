# edgar-ts

## 0.4.0

### Minor Changes

- [#9](https://github.com/medelman17/edgar-ts/pull/9) [`db3bae6`](https://github.com/medelman17/edgar-ts/commit/db3bae69bb14dfefc30cf6db237aa716b112cc7b) Thanks [@medelman17](https://github.com/medelman17)! - Add custom `fetch` function injection to `EdgarClientOptions` and broaden response/init types.

  **New option:** `fetch?: FetchFn` — allows consumers to provide a custom fetch implementation for proxy routing, testing, or custom transport. Falls back to `globalThis.fetch` when not provided.

  **New types:**

  - `FetchResponse` — response type including `json()`, `text()`, `arrayBuffer()`, and `headers` (the methods consumers actually use)
  - `FetchInit` — request init type with `method`, `headers`, `body`, `signal`, and index signature
  - `FetchFn` — updated to use `FetchInit` and `FetchResponse` instead of narrow `Record<string, unknown>` / `{ ok, status }`

  **Type cleanup:** Removed 6 `as unknown as` response casts across consumer files (`fetch-json.ts`, `download/service.ts`, `exhibits/service.ts`, `discovery/pagination.ts`, `discovery/index-service.ts`, `bulk/service.ts`). The broadened `FetchResponse` type makes these casts unnecessary.

  All existing behavior (rate limiting, retry, timeout, telemetry) wraps whatever fetch function is supplied. Non-breaking — existing consumers see no difference.

## 0.3.0

### Minor Changes

- [#7](https://github.com/medelman17/edgar-ts/pull/7) [`0a89fae`](https://github.com/medelman17/edgar-ts/commit/0a89faec6bba2e369f440b95d97b473b4c2bcc3b) Thanks [@medelman17](https://github.com/medelman17)! - Add 9 new methods to EdgarClient for comprehensive SEC EDGAR API coverage:

  **Company Data:**

  - `getCompanyInfo(cik)` — fetch company metadata (name, tickers, SIC, entity type, state of incorporation) from SEC Submissions API
  - `lookupCompany(query)` — search by ticker symbol (exact, case-insensitive) or company name (substring) via `company_tickers.json`

  **Index File Discovery:**

  - `discoverFilings({ from, to })` without a CIK now works — uses SEC quarterly index files (`master.idx`) instead of throwing `ConfigurationError`
  - Supports date range spanning multiple years/quarters with automatic quarterly URL mapping

  **Bulk Data:**

  - `downloadSubmissionsBulk()` — download SEC nightly `submissions.zip` archive (all company metadata)
  - `downloadCompanyFactsBulk()` — download SEC nightly `companyfacts.zip` archive (all XBRL facts)

  **XBRL (Layer 1 — typed API access, no concept normalization):**

  - `getCompanyFacts(cik)` — all XBRL facts across all filings for a company
  - `getCompanyConcept(cik, taxonomy, tag)` — single concept time series (e.g., us-gaap/Revenue)
  - `getFrame(taxonomy, tag, unit, period)` — cross-company comparison at a point in time

  **Full-Text Search:**

  - `searchFilings(query)` — wrap SEC's EFTS Elasticsearch API with keyword search, form type/date/entity filters, and pagination. Note: unofficial/undocumented API.

  **Internal improvements:**

  - Extract shared `fetchJson` utility eliminating duplicated fetch+parse+error boilerplate
  - Extract `fetchSubmissionsResponse` shared between CompanyService and DiscoveryService
  - Add `CompanyInfo`, `CompanyTicker`, `BulkDownloadResult`, XBRL types, and search types to public API
  - Add `exchanges` and `stateOfIncorporation` to internal `SubmissionsResponse` type

## 0.2.0

### Minor Changes

- [#2](https://github.com/medelman17/edgar-ts/pull/2) [`55c4005`](https://github.com/medelman17/edgar-ts/commit/55c4005e7fc51c3a507f5cd88a46a08200fd5b3b) Thanks [@medelman17](https://github.com/medelman17)! - # v0.2.0: Enriched Telemetry & Node 20+

  ## Breaking Changes

  - **Node.js 20+ required**: Dropped support for Node.js 18. Minimum version is now 20.0.0 due to dependency on `node:util.styleText` for colored output.

  ## Features

  ### Enriched Telemetry Events

  All telemetry events now include enhanced context for better observability:

  - `requestId` - Unique UUID per request for correlation and tracing
  - `operation` - EdgarClient method that triggered the request (discoverFilings, listExhibits, downloadExhibit)
  - `endpointClass` - SEC endpoint type (submissions, archive, data)
  - `runtime` - Detected runtime environment (node or bun)

  These fields are now available in all telemetry hooks (`onRequestStart`, `onRequestEnd`, `onRetry`).

  ### New `edgar-ts/telemetry` Export

  Production-ready telemetry helpers available via subpath export:

  #### Console Logger

  Human-readable colored output for development and debugging:

  ```typescript
  import { createConsoleLogger } from "edgar-ts/telemetry";
  const client = new EdgarClient({
    userAgent: "Bot/1.0",
    telemetry: createConsoleLogger(),
  });
  ```

  Features:

  - Colored output using `node:util.styleText` (Node 20+)
  - Optional timestamps
  - Human-readable format: `→ GET [operation]`, `← 200 123ms`, `⟳ Retry 2/3`
  - Customizable output stream

  #### Structured Logger

  JSON Lines output for log aggregation and monitoring:

  ```typescript
  import { createStructuredLogger } from "edgar-ts/telemetry";
  const client = new EdgarClient({
    userAgent: "Bot/1.0",
    telemetry: createStructuredLogger(),
  });
  ```

  Features:

  - One JSON object per line format
  - Pluggable custom formatter
  - Configurable output stream
  - Perfect for ELK, Splunk, DataDog, etc.

  #### Metrics Aggregator

  Track request lifecycle and performance metrics:

  ```typescript
  import { createMetricsAggregator } from "edgar-ts/telemetry";
  const metrics = createMetricsAggregator();
  const client = new EdgarClient({
    userAgent: "Bot/1.0",
    telemetry: metrics,
  });
  const snapshot = metrics.getSnapshot();
  ```

  Metrics tracked:

  - `requestsTotal` - Total requests made
  - `requestsSuccessful` - Successful requests (2xx)
  - `requestsFailed` - Failed requests (4xx/5xx)
  - `requestsFailedByError` - Failures grouped by status code
  - `retriesTotal` - Total retries attempted
  - `rateLimitedRequests` - Requests due to rate limiting
  - `latencyByOperation` - Per-operation latency stats (min/max/avg)
  - `runtime` - Detected runtime

  #### Noop Telemetry

  No-op implementation for testing or explicitly disabling telemetry:

  ```typescript
  import { createNoopTelemetry } from "edgar-ts/telemetry";
  const client = new EdgarClient({
    userAgent: "Bot/1.0",
    telemetry: createNoopTelemetry(),
  });
  ```

  ## Migration

  If you have existing telemetry hooks:

  **Before (v0.1.x):**

  ```typescript
  telemetry: {
    onRequestStart: (event) => console.log(event.url),
    // event only had: url, method, timestamp
  }
  ```

  **After (v0.2.0):**

  ```typescript
  telemetry: {
    onRequestStart: (event) => console.log(event.url, event.requestId, event.operation),
    // event now has: url, method, timestamp, requestId, operation, endpointClass, runtime
  }
  ```

  Your existing hooks continue to work — the new fields are additive and backward compatible. Update to Node.js 20.0.0+ before upgrading edgar-ts to 0.2.0.

  ## Implementation Details

  - Event enrichment happens in `SecHttpClient` with unique `requestId` generation via `crypto.randomUUID()`
  - Service classes (`DiscoveryService`, `ExhibitService`, `DownloadService`) pass operation context via `request()` options
  - Runtime detection uses `process.versions.bun` check (cached at module load)
  - All helpers include graceful error handling to prevent telemetry from breaking client operations
  - Console logger uses Node 20+ `node:util.styleText` for ANSI colors
  - Comprehensive unit and integration tests included

## 0.1.1

### Patch Changes

- Fix SEC EDGAR API compatibility issues discovered during live testing

  - Fix filing index URL to use `{accessionNo}-index.html` instead of `index.html` (which returns a directory listing without exhibit metadata)
  - Fix paginated filing URL base from `www.sec.gov` to `data.sec.gov/submissions/`
  - Fix SEC Submissions API response parsing: filings are returned as parallel arrays, not arrays of objects
  - Filter non-exhibit document types (10-Q, GRAPHIC, XBRL schemas) from exhibit listing instead of throwing validation errors
  - Add example script for live API testing

## 0.1.0

### Minor Changes

- 259ab4d: Initial release of edgar-ts: TypeScript SEC EDGAR client for filing discovery and contract exhibit acquisition.

  ## Features

  - **Filing Discovery**: Date-bounded search with optional CIK and form-type filtering

    - Supports 8-K, 10-K, 10-Q, 20-F, S-1 family (default form set)
    - Deterministic normalization (CIK zero-padding, canonical accession format)
    - Stable sorting and deduplication

  - **Exhibit Enumeration**: Normalized exhibit metadata from SEC filing indices

    - Full exhibit listing per filing
    - Contract-specific filtering (EX-10\* only)
    - Provenance URLs preserved

  - **Raw Download**: Exhibit byte retrieval with integrity verification

    - SHA-256 hashing
    - MIME type hints
    - File size metadata

  - **SEC Compliance**: Built-in rate limiting and retry logic

    - 8 req/s default rate limit (configurable)
    - Exponential backoff with full jitter
    - Mandatory user-agent validation

  - **Runtime Support**: Node.js 18+ and Bun
    - Zero runtime dependencies
    - Dual ESM/CJS exports
    - TypeScript types with isolatedDeclarations

  ## Requirements Satisfied

  All 34 v1 requirements implemented across 5 phases:

  - HTTP-01–07, OBSV-01–02 (Phase 1: HTTP transport)
  - DISC-01–08 (Phase 2: Filing discovery)
  - EXHB-01–05, CNTR-01–02 (Phase 3: Exhibit enumeration)
  - DNLD-01–04 (Phase 4: Download)
  - TYPE-01–02, RLSE-01–04 (Phase 5: Integration/release)

  ## Bundle Size

  3.56 kB gzipped (18% of 20 KB limit)

  ## Breaking Changes

  None (initial release)
