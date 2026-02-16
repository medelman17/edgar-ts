# Telemetry Helpers Design

**Date:** 2026-02-16
**Status:** Approved
**Release:** v0.2.0

## Overview

Enhance the edgar-ts telemetry system with enriched event context and convenience helpers for common observability patterns. This builds on the existing telemetry infrastructure (already wired in `SecHttpClient`) by adding richer event metadata and opt-in helper utilities.

**Goals:**
1. Enrich telemetry events to match observability SLOs vision (operation context, request correlation, runtime detection)
2. Provide production-ready helpers (console logger, structured logger, metrics aggregator, noop)
3. Enable powerful observability without forcing users to implement common patterns from scratch

**Non-goals:**
- Real-time metrics export (Prometheus scraping, OpenTelemetry push)
- Advanced percentile calculations (p50/p95/p99)
- Distributed tracing integration

---

## Architecture

### Module Structure

```
src/
├── telemetry/
│   ├── index.ts              # Barrel export
│   ├── console-logger.ts     # createConsoleLogger()
│   ├── structured-logger.ts  # createStructuredLogger()
│   ├── metrics-aggregator.ts # createMetricsAggregator()
│   └── noop.ts              # createNoopTelemetry()
├── types/
│   └── index.ts              # Enhanced event types
└── http/
    └── client.ts             # SecHttpClient (populates enriched fields)
```

### Import Paths

```typescript
// Main API (unchanged)
import { EdgarClient } from 'edgar-ts'

// Telemetry helpers (new)
import { createConsoleLogger, createMetricsAggregator } from 'edgar-ts/telemetry'
```

### Package.json Exports

```json
{
  "exports": {
    ".": "./dist/index.js",
    "./telemetry": "./dist/telemetry/index.js"
  }
}
```

### Event Flow

1. `EdgarClient` method called (e.g., `discoverFilings()`)
2. Service layer (e.g., `DiscoveryService`) calls `SecHttpClient.request()` with context (`operation`, `endpointClass`)
3. `SecHttpClient` generates `requestId`, detects `runtime`, fires `onRequestStart` with enriched event
4. HTTP request executes
5. Fire `onRequestEnd` or `onRetry` with enriched events
6. Helpers consume events, update internal state (metrics), or produce output (loggers)

**Key design decisions:**
- Event enrichment happens in `SecHttpClient` (single source of truth)
- Helpers are stateless factories returning `TelemetryOptions` objects
- All helpers validate configuration at creation time (fail fast)
- All helpers catch runtime errors to prevent breaking client requests

---

## Event Enrichment

### Enhanced Event Types

```typescript
// src/types/index.ts

export type RequestStartEvent = {
  url: string
  method: string
  timestamp: number
  // NEW FIELDS:
  requestId: string          // Unique ID for correlation
  operation: string          // EdgarClient method ("discoverFilings", "listExhibits", etc.)
  endpointClass: string      // SEC endpoint type ("submissions", "archive", "data")
  runtime: "node" | "bun"    // Detected runtime
}

export type RequestEndEvent = {
  url: string
  method: string
  statusCode: number
  durationMs: number
  timestamp: number
  // NEW FIELDS:
  requestId: string
  operation: string
  endpointClass: string
  runtime: "node" | "bun"
}

export type RetryEvent = {
  url: string
  attempt: number
  maxAttempts: number
  delayMs: number
  error: string
  timestamp: number
  // NEW FIELDS:
  requestId: string
  operation: string
  endpointClass: string
  runtime: "node" | "bun"
}
```

### Implementation Details

**Request ID generation:**
- Use `crypto.randomUUID()` (available in Node 16+, Bun)
- Generated once per `SecHttpClient.request()` call
- Shared across all events (start, end, retry) for that request

**Runtime detection:**
- Check `process.versions.bun` at module load time
- Cache result: `const RUNTIME: "node" | "bun" = process.versions.bun ? "bun" : "node"`

**Operation & endpoint class:**
- `SecHttpClient.request()` gains optional context parameter:
  ```typescript
  async request(url: string, options?: RequestOptions & {
    context?: { operation: string; endpointClass: string }
  })
  ```
- Service classes pass context when calling SecHttpClient:
  ```typescript
  await this.httpClient.request(url, {
    context: { operation: "discoverFilings", endpointClass: "submissions" }
  })
  ```
- Defaults if not provided: `operation: "unknown"`, `endpointClass: "unknown"`

**Endpoint class mapping:**
- `"submissions"` - `https://data.sec.gov/submissions/*`
- `"archive"` - `https://www.sec.gov/Archives/edgar/data/*`
- `"data"` - Other `data.sec.gov` endpoints
- Inferred from URL pattern if context not provided (fallback)

---

## Helper Implementations

### Console Logger

**Factory function:**
```typescript
function createConsoleLogger(options?: {
  colors?: boolean              // Default: true (uses node:util.styleText)
  timestamps?: boolean          // Default: true
  errorStream?: NodeJS.WriteStream  // Default: process.stderr
}): TelemetryOptions
```

**Behavior:**
- Formats events as human-readable console output
- `onRequestStart`: `→ GET https://data.sec.gov/... [discoverFilings] {requestId}`
- `onRequestEnd`: `← 200 GET https://data.sec.gov/... 1234ms [discoverFilings]`
- `onRetry`: `⟳ Retry 2/3 after 500ms: GET https://... (TIMEOUT)`
- Uses colors by default (green for success, red for errors, yellow for retries)
- Writes to stderr to avoid mixing with application logs

**Error handling:**
- Wraps all formatting in try-catch
- Falls back to `JSON.stringify(event)` if formatting fails
- Logs formatting errors to stderr, continues execution

---

### Structured Logger

**Factory function:**
```typescript
function createStructuredLogger(options?: {
  stream?: NodeJS.WritableStream    // Default: process.stdout
  formatter?: (event: TelemetryEvent) => string  // Default: JSON.stringify
}): TelemetryOptions
```

**Behavior:**
- Outputs JSON Lines format (one JSON object per line)
- Default format: `{"event":"request.start","requestId":"...","operation":"discoverFilings",...}\n`
- Pluggable formatter for custom output (CSV, messagepack, etc.)
- Writes to stdout by default (structured logs go to stdout, human-readable to stderr)

**Error handling:**
- Validates stream is writable at creation time
- Wraps writes in try-catch
- Logs serialization errors to stderr, skips event

---

### Metrics Aggregator

**Factory function:**
```typescript
function createMetricsAggregator(): TelemetryOptions & {
  getSnapshot(): MetricsSnapshot
  reset(): void
}
```

**Tracked metrics:**
```typescript
type MetricsSnapshot = {
  // Request lifecycle
  requestsTotal: number
  requestsSuccessful: number
  requestsFailed: number
  requestsFailedByError: Record<string, number>  // e.g., {"TIMEOUT": 3, "RATE_LIMITED": 1}

  // Retries
  retriesTotal: number

  // Latency (per operation)
  latencyByOperation: Record<string, {
    count: number
    min: number
    max: number
    avg: number
    total: number  // sum for recalculating avg
  }>

  // Rate limiting visibility
  rateLimitedRequests: number  // (inferred from retry events with RATE_LIMITED errors)

  // Runtime
  runtime: "node" | "bun"
}
```

**Behavior:**
- Maintains counters and latency stats in memory
- `onRequestStart`: Increment `requestsTotal`
- `onRequestEnd`: Update latency stats, increment `requestsSuccessful` if status 2xx
- `onRequestEnd`: Increment `requestsFailed`, track error type if status 4xx/5xx
- `onRetry`: Increment `retriesTotal`, detect rate limiting from error message
- `getSnapshot()`: Returns current metrics (does not reset)
- `reset()`: Clears all counters (useful for testing or periodic resets)

**Error handling:**
- No external I/O, so fewer error vectors
- Guards against undefined operations/errors with fallback to "unknown"
- Validates numeric values (NaN/Infinity → skip update)

---

### Noop Telemetry

**Factory function:**
```typescript
function createNoopTelemetry(): TelemetryOptions
```

**Behavior:**
- Returns empty functions for all hooks: `{ onRequestStart: () => {}, onRequestEnd: () => {}, onRetry: () => {} }`
- Zero overhead, useful for testing or disabling telemetry without removing code

**Error handling:**
- None needed (no-ops cannot fail)

---

## Error Handling & Fault Tolerance

**Strategy: Validate early, catch at runtime**

### Creation-Time Validation (Fail Fast)

All helpers validate configuration when created:

```typescript
// Console logger
createConsoleLogger({ errorStream: null })
// → throws TypeError("errorStream must be writable")

// Structured logger
createStructuredLogger({ stream: closedStream })
// → throws Error("stream must be writable")

// Metrics aggregator
createMetricsAggregator()
// → No validation needed (no config)
```

**Why:** Catch misconfiguration immediately, before client starts making requests

### Runtime Error Handling (Resilient)

All hooks wrap execution in try-catch to prevent breaking client:

```typescript
// Pseudocode for all helpers
function onRequestStart(event: RequestStartEvent) {
  try {
    // ... helper logic ...
  } catch (err) {
    // Log to stderr (avoid infinite loops with structured logger)
    console.error('[edgar-ts/telemetry] Error in onRequestStart:', err.message)
    // Continue execution (don't throw)
  }
}
```

**Why:** Telemetry bugs should never break SEC requests

### Specific Error Scenarios

**Console logger:**
- Formatting error (bad event structure) → fallback to `JSON.stringify(event)`
- Stream write error (stream closed) → log error to stderr, skip event

**Structured logger:**
- Serialization error (circular reference) → log error to stderr, skip event
- Stream write error → log error to stderr, skip event
- Custom formatter throws → log error, fallback to `JSON.stringify`

**Metrics aggregator:**
- Invalid numeric value (NaN, Infinity) → skip update, log warning
- Missing operation/error fields → use "unknown" as fallback
- Memory overflow (too many unique operations) → cap at 1000 operations, log warning

**Noop:**
- No errors possible (empty functions)

### Error Logging Strategy

- All helpers log errors to **stderr** using `console.error()`
- Prefix all error messages with `[edgar-ts/telemetry]` for easy filtering
- Include helper name and event type: `[edgar-ts/telemetry:console-logger] Error in onRequestStart: ...`
- Never throw from event handlers (swallow errors after logging)

---

## Testing Strategy

**Goal: Comprehensive coverage with unit + integration + edge cases**

### Event Enrichment Tests

**File:** `tests/http/client-enriched-events.test.ts`

**Coverage:**
- ✓ `requestId` is unique per request
- ✓ `requestId` is consistent across start/end/retry events for same request
- ✓ `operation` and `endpointClass` populated from context
- ✓ `operation` and `endpointClass` default to "unknown" if not provided
- ✓ `runtime` correctly detects "node" or "bun"
- ✓ All events include all enriched fields

### Console Logger Tests

**File:** `tests/telemetry/console-logger.test.ts`

**Coverage:**
- ✓ Formats `onRequestStart` with arrow and operation
- ✓ Formats `onRequestEnd` with status code and duration
- ✓ Formats `onRetry` with attempt count and delay
- ✓ Colors enabled by default (green/red/yellow)
- ✓ Colors can be disabled via options
- ✓ Timestamps included by default
- ✓ Writes to stderr by default
- ✓ Custom errorStream option works
- ✓ Handles formatting errors gracefully (fallback to JSON)
- ✓ Handles stream write errors without throwing

### Structured Logger Tests

**File:** `tests/telemetry/structured-logger.test.ts`

**Coverage:**
- ✓ Outputs JSON Lines format (one line per event)
- ✓ Writes to stdout by default
- ✓ Custom stream option works
- ✓ Custom formatter option works
- ✓ Handles serialization errors (circular refs) without throwing
- ✓ Handles stream write errors without throwing
- ✓ Handles custom formatter throwing errors (fallback to JSON.stringify)
- ✓ Validates stream is writable at creation time

### Metrics Aggregator Tests

**File:** `tests/telemetry/metrics-aggregator.test.ts`

**Coverage:**
- ✓ Increments `requestsTotal` on `onRequestStart`
- ✓ Increments `requestsSuccessful` on 2xx status
- ✓ Increments `requestsFailed` on 4xx/5xx status
- ✓ Tracks failed requests by error type
- ✓ Increments `retriesTotal` on `onRetry`
- ✓ Tracks latency stats (min/max/avg) per operation
- ✓ Detects rate limiting from retry errors
- ✓ `getSnapshot()` returns current metrics without resetting
- ✓ `reset()` clears all counters
- ✓ Handles missing operation field (uses "unknown")
- ✓ Handles invalid numeric values (NaN/Infinity)
- ✓ Caps unique operations at 1000 to prevent memory overflow

### Noop Tests

**File:** `tests/telemetry/noop.test.ts`

**Coverage:**
- ✓ Returns empty functions for all hooks
- ✓ Hooks can be called without errors
- ✓ Zero overhead (no-ops do nothing)

### Integration Tests

**File:** `tests/telemetry/integration.test.ts`

**Coverage:**
- ✓ Console logger works with real EdgarClient requests (mocked fetch)
- ✓ Structured logger captures all events for a request lifecycle
- ✓ Metrics aggregator tracks multiple concurrent requests correctly
- ✓ Multiple helpers can be combined (logger + metrics)
- ✓ Telemetry errors don't break client requests
- ✓ Enriched event fields match expected values across helpers

### Edge Case Coverage

**Scenarios:**
- ✓ High concurrency (100+ concurrent requests) - metrics remain accurate
- ✓ Stream closed mid-operation - loggers handle gracefully
- ✓ Circular references in events - structured logger handles
- ✓ Very long URLs - console logger truncates appropriately
- ✓ Missing or malformed event fields - helpers use fallbacks

**Test tooling:**
- Vitest with globals enabled (existing pattern)
- Spy on `console.error` to verify error logging
- Mock streams with `Writable` from `node:stream`
- Fake timers for testing concurrent metrics updates

---

## Implementation Phases

### Phase 1: Event Enrichment

**Tasks:**
1. Add new fields to event types in `src/types/index.ts`
2. Update `SecHttpClient.request()` to accept optional context parameter
3. Implement request ID generation (crypto.randomUUID)
4. Implement runtime detection (process.versions.bun check)
5. Update service classes to pass context (operation, endpointClass)
6. Write tests for event enrichment

**Deliverable:** v0.2.0-alpha.1 — Enriched events available, no helpers yet

---

### Phase 2: Telemetry Helpers

**Tasks:**
1. Implement `createConsoleLogger()` with colors and formatting
2. Implement `createStructuredLogger()` with JSON Lines output
3. Implement `createMetricsAggregator()` with snapshot/reset methods
4. Implement `createNoopTelemetry()`
5. Add `edgar-ts/telemetry` export to package.json
6. Write comprehensive tests for all helpers
7. Write integration tests
8. Update README with examples

**Deliverable:** v0.2.0 — Complete telemetry feature set

---

## Release Notes

**Release:** v0.2.0

**What's new:**
- **Node.js 20+ required** (was 18+)
- **Enriched telemetry events:** Added `requestId`, `operation`, `endpointClass`, `runtime` to all events
- **Telemetry helpers:** New `edgar-ts/telemetry` export with console logger, structured logger, metrics aggregator, and noop

**Changelog:**
```markdown
## v0.2.0 (2026-02-XX)

### Breaking Changes
- Node.js 20+ required (dropped Node.js 18 support)

### Features
- Enriched telemetry events with request ID, operation context, and runtime detection
- New telemetry helpers via `edgar-ts/telemetry`:
  - `createConsoleLogger()` - Colored console output
  - `createStructuredLogger()` - JSON Lines logging
  - `createMetricsAggregator()` - Request lifecycle metrics
  - `createNoopTelemetry()` - Silent telemetry for testing
```

---

## Open Questions

None — design approved.
