---
"edgar-ts": major
---

# v0.2.0: Enriched Telemetry & Node 20+

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
import { createConsoleLogger } from "edgar-ts/telemetry"
const client = new EdgarClient({
  userAgent: "Bot/1.0",
  telemetry: createConsoleLogger()
})
```

Features:
- Colored output using `node:util.styleText` (Node 20+)
- Optional timestamps
- Human-readable format: `→ GET [operation]`, `← 200 123ms`, `⟳ Retry 2/3`
- Customizable output stream

#### Structured Logger
JSON Lines output for log aggregation and monitoring:

```typescript
import { createStructuredLogger } from "edgar-ts/telemetry"
const client = new EdgarClient({
  userAgent: "Bot/1.0",
  telemetry: createStructuredLogger()
})
```

Features:
- One JSON object per line format
- Pluggable custom formatter
- Configurable output stream
- Perfect for ELK, Splunk, DataDog, etc.

#### Metrics Aggregator
Track request lifecycle and performance metrics:

```typescript
import { createMetricsAggregator } from "edgar-ts/telemetry"
const metrics = createMetricsAggregator()
const client = new EdgarClient({
  userAgent: "Bot/1.0",
  telemetry: metrics
})
const snapshot = metrics.getSnapshot()
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
import { createNoopTelemetry } from "edgar-ts/telemetry"
const client = new EdgarClient({
  userAgent: "Bot/1.0",
  telemetry: createNoopTelemetry()
})
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
