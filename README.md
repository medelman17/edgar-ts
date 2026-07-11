# edgar-ts

TypeScript SEC EDGAR client for filing discovery, company data, XBRL financials, and full-text search.

[![npm version](https://badge.fury.io/js/edgar-ts.svg)](https://www.npmjs.com/package/edgar-ts)
[![CI](https://github.com/medelman17/edgar-ts/actions/workflows/ci.yml/badge.svg)](https://github.com/medelman17/edgar-ts/actions/workflows/ci.yml)

## Installation

```bash
npm install edgar-ts
# or
pnpm add edgar-ts
# or
yarn add edgar-ts
```

## Requirements

- **Node.js 20.0.0+** or **Bun 1.0+**
- Zero runtime dependencies

## Features

- **Filing discovery** — Date-bounded search with optional CIK and form-type filtering
- **Index file discovery** — Bulk discovery across all filers via SEC quarterly index files
- **Company metadata** — Name, tickers, SIC code, entity type, state of incorporation
- **Ticker/name lookup** — Resolve tickers or company names to CIKs
- **Exhibit enumeration** — Normalized exhibit metadata from filing indices
- **Contract filtering** — Built-in `EX-10*` contract exhibit isolation
- **Raw download** — Exhibit bytes with MIME hints and SHA-256 integrity hash
- **Bulk data** — Download SEC nightly archives (submissions.zip, companyfacts.zip)
- **XBRL financials** — Company Facts, Company Concept, and Frames API access
- **Full-text search** — Keyword search across all SEC filings via EFTS
- **SEC-compliant** — Mandatory user-agent, rate limiting (8 req/s default), bounded retries
- **Deterministic** — Canonical normalization, stable sort, deduplication
- **Zero dependencies** — No runtime dependencies
- **Dual runtime** — Node.js and Bun support

## Quick Start

```ts
import { EdgarClient } from "edgar-ts"

const client = new EdgarClient({
  userAgent: "AcmeLegalBot/1.0 (ops@acme.test)",
})

// Look up a company by ticker
const matches = await client.lookupCompany("AAPL")
const { cik } = matches[0] // "0000320193"

// Get company metadata
const company = await client.getCompanyInfo(cik)
console.log(company.name, company.sic, company.tickers)

// Discover filings for a specific company
const filings = await client.discoverFilings({
  cik,
  from: "2026-01-01",
  to: "2026-12-31",
})

// Or discover across ALL filers (uses quarterly index files)
const allFilings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-03-31",
  formTypes: ["10-K"],
})

// Get contract exhibits (EX-10*) for a filing
for (const filing of filings) {
  const exhibits = await client.listContractExhibits(filing)
  for (const exhibit of exhibits) {
    const { bytes, sha256, sizeBytes } = await client.downloadExhibit(exhibit)
    // Store bytes and metadata in your downstream system
  }
}
```

## API

### `new EdgarClient(options)`

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `userAgent` | `string` | **required** | Descriptive user-agent for SEC compliance |
| `maxRequestsPerSecond` | `number` | `8` | Global request rate cap |
| `timeoutMs` | `number` | `10000` | Per-request timeout |
| `retries` | `RetryOptions` | `{ maxAttempts: 3, baseDelayMs: 250, maxDelayMs: 4000 }` | Retry configuration |
| `telemetry` | `TelemetryOptions` | — | Optional request/retry hooks |

### Methods

#### Company Data

| Method | Returns | Description |
|--------|---------|-------------|
| `getCompanyInfo(cik)` | `Promise<CompanyInfo>` | Company metadata (name, tickers, SIC, entity type, etc.) |
| `lookupCompany(query)` | `Promise<CompanyTicker[]>` | Search by ticker (exact) or company name (substring) |

#### Filing Discovery

| Method | Returns | Description |
|--------|---------|-------------|
| `discoverFilings(input)` | `Promise<FilingRef[]>` | Date-bounded filing discovery. With CIK: uses Submissions API. Without CIK: uses quarterly index files. |

#### Exhibits

| Method | Returns | Description |
|--------|---------|-------------|
| `listExhibits(filing)` | `Promise<ExhibitRef[]>` | All exhibits for a filing |
| `listContractExhibits(filing)` | `Promise<ExhibitRef[]>` | Contract exhibits only (EX-10*) |
| `downloadExhibit(exhibit)` | `Promise<DownloadedExhibit>` | Raw bytes + metadata + SHA-256 |

#### Bulk Data

| Method | Returns | Description |
|--------|---------|-------------|
| `downloadSubmissionsBulk()` | `Promise<BulkDownloadResult>` | Download SEC nightly submissions.zip (~2GB) |
| `downloadCompanyFactsBulk()` | `Promise<BulkDownloadResult>` | Download SEC nightly companyfacts.zip |

#### XBRL Financials

| Method | Returns | Description |
|--------|---------|-------------|
| `getCompanyFacts(cik)` | `Promise<CompanyFacts>` | All XBRL facts across all filings |
| `getCompanyConcept(cik, taxonomy, tag)` | `Promise<CompanyConcept>` | Single concept time series (e.g., us-gaap/Revenue) |
| `getFrame(taxonomy, tag, unit, period)` | `Promise<Frame>` | Cross-company comparison at a point in time |

#### Full-Text Search

| Method | Returns | Description |
|--------|---------|-------------|
| `searchFilings(query)` | `Promise<SearchResult>` | Keyword search with form type, date, and entity filters |

> **Note:** `searchFilings` wraps the SEC's EFTS Elasticsearch API, which is undocumented and could change without notice.

### Examples

#### Company lookup and metadata

```typescript
// Find a company by ticker
const results = await client.lookupCompany("MSFT")
// [{ cik: "0000789019", ticker: "MSFT", name: "MICROSOFT CORP", exchange: "Nasdaq" }]

// Get full company metadata
const info = await client.getCompanyInfo("789019")
// { cik: "0000789019", name: "MICROSOFT CORP", tickers: ["MSFT"], sic: "7372", ... }
```

#### Filing discovery

```typescript
// Discover filings for a specific company
const filings = await client.discoverFilings({
  cik: "320193",
  from: "2026-01-01",
  to: "2026-12-31",
})

// Discover across all filers (no CIK — uses index files)
const allFilings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-03-31",
  formTypes: ["10-K", "10-Q"],
})

// Custom form types for a specific company
const proxyFilings = await client.discoverFilings({
  cik: "320193",
  from: "2026-01-01",
  to: "2026-12-31",
  formTypes: ["DEF 14A"],
})
```

#### XBRL financial data

```typescript
// Get all XBRL facts for Apple
const facts = await client.getCompanyFacts("320193")

// Get Revenue time series
const revenue = await client.getCompanyConcept("320193", "us-gaap", "Revenue")
for (const val of revenue.units.USD) {
  console.log(`FY${val.fy}: $${val.val}`)
}

// Compare Revenue across all companies for Q1 2024
const frame = await client.getFrame("us-gaap", "Revenue", "USD", "CY2024Q1")
console.log(`${frame.data.length} companies reported Revenue`)
```

#### Full-text search

```typescript
// Search for filings mentioning "non-compete"
const results = await client.searchFilings({
  q: "non-compete agreement",
  formTypes: ["10-K", "8-K"],
  from: "2024-01-01",
  to: "2024-12-31",
})

// EFTS saturates totals at 10,000 — "gte" means slice the query (by date/form) to enumerate fully
console.log(`${results.total}${results.totalRelation === "gte" ? "+" : ""} filings found`)

for (const hit of results.hits) {
  // Each hit identifies the exact sub-document that matched, not just the filing
  console.log(`${hit.entityName} — ${hit.formType} (${hit.fileDate})`)
  console.log(`  matched ${hit.fileType ?? "?"} ${hit.filename} in ${hit.accessionNo}`)
  console.log(`  filers: ${hit.ciks.join(", ")}`) // co-filers included (e.g. bidder + target)
}
```

#### Exhibits and downloads

```typescript
const filing = filings[0]
const exhibits = await client.listExhibits(filing)
const contracts = await client.listContractExhibits(filing)

const downloaded = await client.downloadExhibit(contracts[0])
console.log(`Downloaded ${downloaded.sizeBytes} bytes`)
console.log(`SHA-256: ${downloaded.sha256}`)
console.log(`MIME type: ${downloaded.mimeType || "unknown"}`)
```

### Type Exports

```typescript
import type {
  EdgarClientOptions,
  FilingRef,
  ExhibitRef,
  DownloadedExhibit,
  CompanyInfo,
  CompanyTicker,
  SearchQuery,
  SearchResult,
  SearchHit,
} from "edgar-ts"
```

### Error Handling

```typescript
import { EdgarError, ValidationError, TimeoutError } from "edgar-ts"

try {
  await client.discoverFilings(input)
} catch (err) {
  if (err instanceof ValidationError) {
    // Invalid input parameters
  } else if (err instanceof TimeoutError) {
    // Request exceeded timeout
  }
}
```

## Telemetry & Observability

edgar-ts provides optional telemetry helpers for logging and metrics:

### Console Logger

Human-readable colored output for development:

```typescript
import { EdgarClient } from "edgar-ts"
import { createConsoleLogger } from "edgar-ts/telemetry"

const client = new EdgarClient({
  userAgent: "MyBot/1.0 (contact@example.com)",
  telemetry: createConsoleLogger()
})

// Outputs:
// → GET https://data.sec.gov/submissions/... [discoverFilings] {abc12345}
// ← 200 GET https://data.sec.gov/submissions/... 1234ms [discoverFilings]
// ⟳ Retry 2/3 after 500ms: GET ... (TIMEOUT)
```

### Metrics Aggregator

Track request lifecycle and rate limiting metrics:

```typescript
import { createMetricsAggregator } from "edgar-ts/telemetry"

const metrics = createMetricsAggregator()
const client = new EdgarClient({
  userAgent: "MyBot/1.0 (contact@example.com)",
  telemetry: metrics
})

// ... make requests ...

const snapshot = metrics.getSnapshot()
console.log(snapshot.requestsTotal)       // 42
console.log(snapshot.requestsSuccessful)  // 40
console.log(snapshot.requestsFailed)      // 2
console.log(snapshot.latencyByOperation)  // { discoverFilings: { avg: 250, min: 100, max: 1200 } }
console.log(snapshot.rateLimitedRequests)  // 0
```

### Structured Logger

JSON Lines output for log aggregation systems:

```typescript
import { createStructuredLogger } from "edgar-ts/telemetry"

const client = new EdgarClient({
  userAgent: "MyBot/1.0 (contact@example.com)",
  telemetry: createStructuredLogger()
})

// Outputs JSON Lines:
// {"event":"request.start","url":"...","operation":"discoverFilings",...}
// {"event":"request.end","statusCode":200,"durationMs":1234,...}
// {"event":"request.retry","attempt":2,"error":"TIMEOUT",...}
```

### Custom Telemetry

Implement your own hooks for integration with observability platforms:

```typescript
const client = new EdgarClient({
  userAgent: "MyBot/1.0 (contact@example.com)",
  telemetry: {
    onRequestStart: (event) => {
      console.log(`Starting ${event.operation} (${event.requestId})`)
    },
    onRequestEnd: (event) => {
      console.log(`Completed in ${event.durationMs}ms`)
    },
    onRetry: (event) => {
      console.log(`Retry ${event.attempt}/${event.maxAttempts}`)
    }
  }
})
```

**Telemetry Event Fields:**
- `requestId` - Unique ID for request correlation
- `operation` - EdgarClient method (discoverFilings, listExhibits, getCompanyInfo, searchFilings, etc.)
- `endpointClass` - SEC endpoint type (submissions, archive, full-index, xbrl, efts, files, bulk-data)
- `runtime` - Detected runtime (node or bun)
- `timestamp` - Event timestamp (milliseconds)
- `url`, `method`, `statusCode`, `durationMs` - Request details

## Development

```bash
pnpm install        # Install dependencies
pnpm test:run       # Run tests
pnpm build          # Build (ESM + CJS)
pnpm lint           # Lint
pnpm typecheck      # Type check
```

## License

MIT
