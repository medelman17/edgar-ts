# edgar-ts

TypeScript SEC EDGAR client for filing discovery and contract exhibit acquisition.

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
- **Exhibit enumeration** — Normalized exhibit metadata from filing indices
- **Contract filtering** — Built-in `EX-10*` contract exhibit isolation
- **Raw download** — Exhibit bytes with MIME hints and SHA-256 integrity hash
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

// Discover filings in a date range
const filings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-01-31",
  cik: "320193", // optional: scope to specific issuer
})

// Get contract exhibits (EX-10*) for each filing
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

| Method | Returns | Description |
|--------|---------|-------------|
| `discoverFilings(input)` | `Promise<FilingRef[]>` | Date-bounded filing discovery |
| `listExhibits(filing)` | `Promise<ExhibitRef[]>` | All exhibits for a filing |
| `listContractExhibits(filing)` | `Promise<ExhibitRef[]>` | Contract exhibits only (EX-10*) |
| `downloadExhibit(exhibit)` | `Promise<DownloadedExhibit>` | Raw bytes + metadata + SHA-256 |

### Examples

#### `discoverFilings(input)`

```typescript
// Basic date range query (requires CIK)
const filings = await client.discoverFilings({
  cik: "320193",
  from: "2026-01-01",
  to: "2026-01-31",
})

// Custom form types
const customFilings = await client.discoverFilings({
  cik: "320193",
  from: "2026-01-01",
  to: "2026-01-31",
  formTypes: ["8-K"],
})
```

#### `listExhibits(filing)`

```typescript
const filing = filings[0]
const exhibits = await client.listExhibits(filing)
// Returns all exhibits with: sequence, type, description, filename, url
```

#### `listContractExhibits(filing)`

```typescript
const contractExhibits = await client.listContractExhibits(filing)
// Returns only EX-10* exhibits (contracts)
```

#### `downloadExhibit(exhibit)`

```typescript
const exhibit = contractExhibits[0]
const downloaded = await client.downloadExhibit(exhibit)
console.log(`Downloaded ${downloaded.sizeBytes} bytes`)
console.log(`SHA-256: ${downloaded.sha256}`)
console.log(`MIME type: ${downloaded.mimeType || "unknown"}`)
// downloaded.bytes is Uint8Array of raw exhibit content
```

### Type Exports

```typescript
import type {
  EdgarClientOptions,
  FilingRef,
  ExhibitRef,
  DownloadedExhibit,
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
- `operation` - EdgarClient method (discoverFilings, listExhibits, etc.)
- `endpointClass` - SEC endpoint type (submissions, archive, data)
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
