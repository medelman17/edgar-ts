# edgar-ts API Contract

**Date:** 2026-02-15  
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

export declare class EdgarClient {
  constructor(options: EdgarClientOptions);

  discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]>;
  listExhibits(filing: FilingRef): Promise<ExhibitRef[]>;
  listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]>;
  downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit>;
}
```

## Method Contracts

## `new EdgarClient(options)`
1. Requires non-empty `userAgent`.
2. Applies default options when unset.
3. Throws `ConfigurationError` for invalid options.

## `discoverFilings(input)`
1. Validates date format and range.
2. If `formTypes` omitted, applies core default forms.
3. Returns deduplicated and stable-sorted `FilingRef[]`.
4. Throws typed errors for validation, transport, and normalization failures.

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

## Example Usage

```ts
import { EdgarClient } from "edgar-ts";

const client = new EdgarClient({
  userAgent: "AcmeLegalBot/1.0 (ops@acme.test)",
});

const filings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-01-31",
  cik: "320193",
});

for (const filing of filings) {
  const exhibits = await client.listContractExhibits(filing);
  for (const exhibit of exhibits) {
    const payload = await client.downloadExhibit(exhibit);
    // Store payload.bytes and metadata in downstream system.
  }
}
```
