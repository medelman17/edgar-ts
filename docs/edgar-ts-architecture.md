# edgar-ts Architecture Specification

**Date:** 2026-02-15  
**Status:** Approved  
**Scope:** Minimal EDGAR contract acquisition subset

## Architecture Goals
1. Keep v1 deep modules narrow and testable.
2. Ensure deterministic normalized outputs.
3. Enforce safe SEC request behavior by default.
4. Keep persistence and parsing concerns out of library boundaries.

## High-Level Design
`EdgarClient` orchestrates calls through dedicated modules:
1. `http`: transport, retry, timeout, rate limiting.
2. `discovery`: filing discovery and normalization.
3. `exhibits`: filing-detail parsing and exhibit extraction.
4. `filters`: contract exhibit matching (`EX-10*`).
5. `download`: binary retrieval and integrity metadata.
6. `types`: public and internal canonical contracts.
7. `errors`: typed error taxonomy and retryability flags.
8. `telemetry`: optional hooks for logs/events/metrics.

## Component Boundaries
1. `EdgarClient` (public facade)
- Accepts options and exposes high-level methods.
- Delegates all heavy logic to internal modules.

2. `SecHttpClient`
- Adds required headers and request identity.
- Applies token-bucket limiter.
- Applies retry and timeout strategy.
- Produces typed transport outcomes.

3. `DiscoveryService`
- Queries discovery endpoints/feeds.
- Applies form-type filtering and date bounds.
- Normalizes and deduplicates `FilingRef` records.

4. `ExhibitService`
- Resolves filing details.
- Extracts and normalizes `ExhibitRef` records.
- Preserves provenance URLs.

5. `ContractExhibitFilter`
- Implements strict `EX-10*` inclusion rules.
- Performs normalized matching for dotted/suffixed forms.

6. `DownloadService`
- Fetches raw exhibit bytes.
- Determines size metadata.
- Computes SHA-256 digest.

7. `ErrorMapper`
- Converts raw failures into typed library errors with retryability hints.

## Data Flow
1. `discoverFilings(input)`
- Validate input.
- Request source data via `SecHttpClient`.
- Filter by date and forms.
- Normalize, dedupe, sort.
- Return `FilingRef[]`.

2. `listExhibits(filing)`
- Validate filing identity.
- Resolve filing details.
- Parse exhibit list.
- Normalize and sort.
- Return `ExhibitRef[]`.

3. `listContractExhibits(filing)`
- Call `listExhibits`.
- Apply `EX-10*` filter.
- Return filtered `ExhibitRef[]`.

4. `downloadExhibit(exhibit)`
- Validate exhibit URL/identity.
- Fetch bytes.
- Capture metadata (`mimeType`, `sizeBytes`).
- Hash bytes (`sha256`).
- Return `DownloadedExhibit`.

## Determinism and Identity
1. Filing identity key: canonical accession + CIK.
2. Exhibit identity key: accession + canonical sequence.
3. Stable sort order:
- filings: filingDate ascending, accession ascending.
- exhibits: sequence ascending, filename ascending.

## Retry, Timeout, and Rate Limit Placement
1. Implemented only in `SecHttpClient` to avoid policy drift.
2. Retry decision driven by `ErrorMapper` retryability classification.
3. Rate limiter is global per client instance.
4. Timeouts are per request with optional caller override.

## Extensibility Points
1. Additional exhibit families can be introduced by adding filter strategies.
2. Additional discovery strategies can be added behind `DiscoveryService` adapters.
3. No storage interfaces in v1; consumers own persistence adapters.

## Security and Compliance Boundaries
1. User-agent required and validated at construction.
2. Request cap defaults remain within SEC safe threshold.
3. No secret storage inside library.
4. No disk writes in core library operations.

## Runtime Considerations (Node + Bun)
1. Prefer web-standard APIs (`fetch`, `AbortSignal`, `Uint8Array`).
2. Isolate hashing and stream helpers behind runtime-safe wrappers.
3. Validate parity in CI matrix.

## Failure Model
1. Transport failures produce typed retriable/non-retriable errors.
2. Normalization failures produce non-retriable data-shape errors unless explicitly marked recoverable.
3. Partial batch behavior (if added later) must return explicit per-item outcomes.

## Architectural Invariants
1. Public API remains high-level and minimal in v1.
2. No persistence side effects.
3. No parsing/analysis responsibilities.
4. Every returned record includes source provenance data.
