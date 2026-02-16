# Architecture

**Analysis Date:** 2026-02-15

## Pattern Overview

**Overall:** Layered facade with delegated responsibilities to specialized modules

**Key Characteristics:**
- `EdgarClient` acts as a public facade that validates options and delegates all heavy logic to internal modules
- Each internal module owns a specific concern (HTTP transport, discovery, exhibits, download, telemetry)
- Typed error taxonomy with retryability flags enables intelligent orchestration and retry policies
- Deterministic normalization across all data transformations ensures stable, reproducible results
- Zero runtime dependencies and web-standard API usage enables Node.js and Bun parity

## Layers

**Public API Layer:**
- Purpose: Expose high-level client interface to consumers
- Location: `src/client.ts`
- Contains: `EdgarClient` class with four core methods: `discoverFilings()`, `listExhibits()`, `listContractExhibits()`, `downloadExhibit()`
- Depends on: All internal modules via delegation
- Used by: Library consumers

**Transport Layer:**
- Purpose: Manage all HTTP concerns (headers, rate limiting, retry, timeout, abort signals)
- Location: `src/http/`
- Contains: `SecHttpClient` (not yet implemented) responsible for SEC-compliant request handling
- Depends on: `errors` module for error mapping
- Used by: All data-retrieval modules

**Discovery Layer:**
- Purpose: Query SEC endpoints for filing metadata within date bounds and form-type constraints
- Location: `src/discovery/`
- Contains: `DiscoveryService` (not yet implemented) that fetches, normalizes, deduplicates, and sorts filing records
- Depends on: `http` for transport, `errors` for error classification
- Used by: `EdgarClient.discoverFilings()`

**Exhibit Enumeration Layer:**
- Purpose: Parse filing-detail endpoints to extract exhibit metadata
- Location: `src/exhibits/`
- Contains: `ExhibitService` (not yet implemented) that resolves filing details, extracts normalized exhibit records, preserves URLs
- Depends on: `http` for transport, `errors` for error classification
- Used by: `EdgarClient.listExhibits()`

**Filtering Layer:**
- Purpose: Apply business-logic filters (e.g., `EX-10*` contract matching)
- Location: `src/exhibits/` (integrated with exhibit parsing)
- Contains: Contract exhibit filter logic that matches dotted and suffixed exhibit types
- Depends on: Exhibit enumeration results
- Used by: `EdgarClient.listContractExhibits()`

**Download Layer:**
- Purpose: Fetch raw exhibit bytes with metadata computation
- Location: `src/download/`
- Contains: `DownloadService` (not yet implemented) for binary retrieval, size detection, and SHA-256 hashing
- Depends on: `http` for transport, Node/Bun crypto APIs
- Used by: `EdgarClient.downloadExhibit()`

**Type Contracts Layer:**
- Purpose: Define all public and internal type contracts
- Location: `src/types/index.ts`
- Contains: `EdgarClientOptions`, `RetryOptions`, `TelemetryOptions`, `FilingRef`, `ExhibitRef`, `DownloadedExhibit`, request/retry event types
- Depends on: Nothing (pure types)
- Used by: All modules and consumers

**Error Taxonomy Layer:**
- Purpose: Define typed errors with retryability classifications
- Location: `src/errors/index.ts`
- Contains: `EdgarError` base class and specialized subclasses (`ConfigurationError`, `ValidationError`, `TransportError`, `RateLimitedError`, `TimeoutError`, `NotFoundError`, `ParseError`) each with a `retryable` boolean flag
- Depends on: Nothing (pure error types)
- Used by: All error-handling code; enables orchestrators to make retry decisions

**Telemetry Layer:**
- Purpose: Provide optional observability hooks for request lifecycle events
- Location: `src/telemetry/`
- Contains: Hook definitions and optional event emission (not yet implemented)
- Depends on: Type contracts
- Used by: `SecHttpClient` for emitting request/retry events when enabled

## Data Flow

**Filing Discovery:**

1. Consumer calls `client.discoverFilings({ from, to, cik?, formTypes? })`
2. `EdgarClient` validates input
3. `DiscoveryService` queries SEC EDGAR via `SecHttpClient` with date and form-type parameters
4. Raw results are fetched through rate-limited, retried transport
5. Results are normalized (canonical CIK padding, accession format), deduplicated by (cik, accessionNo) key, and sorted stably (filingDate asc, accession asc)
6. Returns `FilingRef[]` with guaranteed deduplication and deterministic order

**Exhibit Enumeration:**

1. Consumer calls `client.listExhibits(filing: FilingRef)`
2. `EdgarClient` validates filing identity (cik + accessionNo)
3. `ExhibitService` resolves filing detail page via `SecHttpClient`
4. Filing index is parsed to extract exhibit metadata (sequence, type, description, filename, URL)
5. Results are normalized, deduplicated by (accession, sequence), and sorted stably (sequence asc, filename asc)
6. Returns `ExhibitRef[]` with provenance URLs intact

**Contract Exhibit Filtering:**

1. Consumer calls `client.listContractExhibits(filing: FilingRef)`
2. Internally calls `listExhibits()` to get full exhibit list
3. Filters result set to only `EX-10*` items (EX-10.1, EX-10.2, etc.) using normalized matching
4. Returns filtered `ExhibitRef[]` maintaining stable sort

**Exhibit Download:**

1. Consumer calls `client.downloadExhibit(exhibit: ExhibitRef)`
2. `EdgarClient` validates exhibit identity (accessionNo + sequence)
3. `DownloadService` fetches raw bytes from `exhibit.exhibitUrl` via rate-limited `SecHttpClient`
4. Bytes are captured and metadata determined: content-length → `sizeBytes`, content-type hint → `mimeType`
5. SHA-256 digest computed using Node/Bun native `crypto.subtle`
6. Returns `DownloadedExhibit` with bytes, size, mime hint, and integrity hash

**State Management:**

- Client-level configuration held in `EdgarClient` constructor options (userAgent, maxRequestsPerSecond, timeoutMs, retries, telemetry)
- Rate limiter state is per-client instance (token-bucket algorithm)
- No cross-request state; all operations are stateless beyond transport layer rate limiting
- Normalization is deterministic function application; no mutable registries

## Key Abstractions

**FilingRef:**
- Purpose: Immutable identity and provenance for a single SEC filing
- Examples: `src/types/index.ts` line 65-76
- Pattern: Value object containing canonical CIK (10-digit zero-padded), accession number, form type, filing date, and full EDGAR URL
- Uniqueness: Keyed by (cik, accessionNo); deduplication is mandatory across discovery results

**ExhibitRef:**
- Purpose: Immutable identity and provenance for a single exhibit within a filing
- Examples: `src/types/index.ts` line 78-91
- Pattern: Value object containing parent accession, sequence number, exhibit type (e.g. "EX-10.1"), optional description, filename, and full EDGAR URL
- Uniqueness: Keyed by (accession, sequence); deduplication is mandatory across exhibit enumeration results

**DownloadedExhibit:**
- Purpose: Immutable record of downloaded exhibit with computed integrity metadata
- Examples: `src/types/index.ts` line 93-104
- Pattern: Value object containing the original `ExhibitRef`, raw `Uint8Array` bytes, optional MIME type hint, size in bytes, and SHA-256 hex digest
- Integrity: SHA-256 digest enables consumer downstream validation

**EdgarError (and Subclasses):**
- Purpose: Enable typed error handling with orchestrator-friendly retryability hints
- Examples: `src/errors/index.ts` line 13-83
- Pattern: Typed error hierarchy with base `EdgarError` extending native `Error` and specialized subclasses for different failure modes
- Retryability: Each error carries a boolean `retryable` flag; `RateLimitedError` and `TimeoutError` are always retryable; `ConfigurationError`, `ValidationError`, `NotFoundError`, `ParseError` are never retryable; `TransportError` retryability is configurable
- Composability: All errors preserve cause chains and carry optional metadata (statusCode, URL, etc.)

**RetryOptions:**
- Purpose: Encapsulate exponential-backoff retry policy
- Examples: `src/types/index.ts` line 16-23
- Pattern: Configuration object with maxAttempts (default 3), baseDelayMs (default 250), maxDelayMs (default 4000)
- Enforcement: Applied uniformly across all transport requests via `SecHttpClient`

**TelemetryOptions:**
- Purpose: Provide optional hooks into request lifecycle without coupling to observability frameworks
- Examples: `src/types/index.ts` line 25-52
- Pattern: Optional callback object with `onRequestStart()`, `onRequestEnd()`, `onRetry()` hooks
- Emissions: Called by `SecHttpClient` when enabled; consumers can forward events to logging, metrics, or distributed tracing systems

## Entry Points

**EdgarClient Constructor:**
- Location: `src/client.ts` line 24-36
- Triggers: Library consumer calls `new EdgarClient(options)`
- Responsibilities: Validate userAgent (required, non-empty), apply defaults to maxRequestsPerSecond (8) and timeoutMs (10000), merge retry options with defaults, pass telemetry config forward; throws `ConfigurationError` on invalid options

**discoverFilings():**
- Location: `src/client.ts` line 38-41
- Triggers: Consumer calls `client.discoverFilings({ from, to, cik?, formTypes? })`
- Responsibilities: Stub implementation; will delegate to `DiscoveryService` to query EDGAR, apply date/form filtering, normalize, deduplicate, sort, and return `FilingRef[]`

**listExhibits():**
- Location: `src/client.ts` line 43-46
- Triggers: Consumer calls `client.listExhibits(filing: FilingRef)`
- Responsibilities: Stub implementation; will delegate to `ExhibitService` to fetch filing details, extract exhibit list, normalize, deduplicate, sort, and return `ExhibitRef[]`

**listContractExhibits():**
- Location: `src/client.ts` line 48-51
- Triggers: Consumer calls `client.listContractExhibits(filing: FilingRef)`
- Responsibilities: Stub implementation; will call `listExhibits()` and apply `EX-10*` filter to return contract-only `ExhibitRef[]`

**downloadExhibit():**
- Location: `src/client.ts` line 53-56
- Triggers: Consumer calls `client.downloadExhibit(exhibit: ExhibitRef)`
- Responsibilities: Stub implementation; will delegate to `DownloadService` to fetch bytes, compute size and SHA-256, and return `DownloadedExhibit`

## Error Handling

**Strategy:** Typed, composable, retryability-aware error taxonomy

**Patterns:**

1. **Configuration Validation:** `ConfigurationError` thrown synchronously from constructor if userAgent is missing or empty (non-retryable)

2. **Validation Errors:** `ValidationError` for malformed inputs like invalid date formats or missing required fields (non-retryable)

3. **Transport Failures:** `TransportError` with configurable retryability for HTTP-level failures (e.g., malformed request syntax is non-retryable; connection reset may be retryable)

4. **Rate Limiting:** `RateLimitedError` for 429 responses; always retryable with automatic backoff

5. **Timeouts:** `TimeoutError` for request timeout or AbortSignal expiration; always retryable

6. **Not Found:** `NotFoundError` for 404 responses; non-retryable (filing/exhibit truly does not exist)

7. **Parse Errors:** `ParseError` for unexpected response structure (e.g., filing index format changes); non-retryable (indicates API contract drift)

8. **Cause Chains:** All errors support `cause` option to preserve original error context; orchestrators can inspect root cause via `error.cause`

9. **Metadata:** All errors support optional `metadata` object for attaching statusCode, URL, attempt count, etc.

## Cross-Cutting Concerns

**Logging:** Not built into library; consumers use telemetry hooks (`onRequestStart`, `onRequestEnd`, `onRetry`) to forward events to their logging system

**Validation:** Input validation happens at `EdgarClient` method boundaries (not yet implemented); invalid dates, missing CIKs, invalid form types are caught before transport

**Authentication:** SEC EDGAR does not require authentication; user-agent requirement is enforced at client construction as a compliance checkpoint

**Rate Limiting:** Implemented only in `SecHttpClient` using token-bucket algorithm; default 8 req/s enforces SEC safe threshold

**Retry Policy:** Implemented only in `SecHttpClient`; driven by error `retryable` flags and `RetryOptions` (exponential backoff with jitter); policy drift prevented by centralizing logic

**Determinism:** All discovery and exhibit enumeration results are deduplicated and sorted to ensure deterministic output across invocations with identical inputs

---

*Architecture analysis: 2026-02-15*
