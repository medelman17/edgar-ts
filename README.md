# edgar-ts

TypeScript SEC EDGAR client for filing discovery and contract exhibit acquisition.

> **Status**: Under development — not yet published to npm.

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
// Basic date range query
const filings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-01-31",
})

// Filter by CIK
const appleFilings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-01-31",
  cik: "320193",
})

// Custom form types
const customFilings = await client.discoverFilings({
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
