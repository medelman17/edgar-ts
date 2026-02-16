# edgar-ts Data Model and Normalization Specification

**Date:** 2026-02-15  
**Status:** Approved

## Purpose
Define canonical data contracts and normalization behavior so downstream systems can implement idempotent storage and deterministic processing.

## Canonical Entities
1. `FilingRef`
2. `ExhibitRef`
3. `DownloadedExhibit`
4. `IdentityKey` (derived)

## `FilingRef`
```ts
type FilingRef = {
  cik: string;
  accessionNo: string;
  formType: string;
  filingDate: string;
  filingUrl: string;
};
```

Normalization rules:
1. `cik`: numeric string zero-padded to length 10.
2. `accessionNo`: canonical hyphenated representation (`##########-##-######`).
3. `formType`: trimmed uppercase; preserve slash and amendment semantics.
4. `filingDate`: ISO date only (`YYYY-MM-DD`).
5. `filingUrl`: absolute URL string.

Derived identity:
- `filingIdentity = "{cik}:{accessionNo}"`

## `ExhibitRef`
```ts
type ExhibitRef = {
  accessionNo: string;
  sequence: string;
  type: string;
  description?: string;
  filename: string;
  exhibitUrl: string;
};
```

Normalization rules:
1. `accessionNo`: canonical format as above.
2. `sequence`: numeric token normalized to string without leading whitespace.
3. `type`: uppercase and punctuation-normalized for matcher compatibility.
4. `description`: optional, trimmed; empty strings converted to `undefined`.
5. `filename`: basename-preserving field from source document record.
6. `exhibitUrl`: absolute URL.

Derived identity:
- `exhibitIdentity = "{accessionNo}:{sequence}"`

## `DownloadedExhibit`
```ts
type DownloadedExhibit = {
  exhibit: ExhibitRef;
  bytes: Uint8Array;
  mimeType?: string;
  sizeBytes: number;
  sha256: string;
};
```

Normalization rules:
1. `sizeBytes`: non-negative integer.
2. `sha256`: lowercase hex string length 64.
3. `mimeType`: optional if upstream omits/invalid.

## Dedupe Rules
1. Filing-level dedupe key: `filingIdentity`.
2. Exhibit-level dedupe key: `exhibitIdentity`.
3. If duplicate keys carry conflicting non-key fields, retain first stable-sorted record and emit warning telemetry event.

## Sorting Rules
1. Filings sorted by:
- `filingDate` ascending
- `accessionNo` ascending
2. Exhibits sorted by:
- numeric `sequence` ascending
- `filename` ascending

## Contract Exhibit Matching (`EX-10*`)
Accepted after normalized comparison:
1. `EX-10`
2. `EX-10.1`
3. `EX-10.01`
4. `EX-10A`
5. equivalent normalized separators (`EX_10`, `EX/10`) treated consistently by matcher.

Rejected:
1. non-10 exhibit families (`EX-4`, `EX-99`, etc.)
2. empty or malformed type when unable to normalize safely

## Data Integrity Requirements
1. Download hash must be computed over exact returned bytes.
2. Hash function: SHA-256 only in v1.
3. No in-place mutation of normalized objects after return.

## Forward Compatibility Rules
1. Additive optional fields are allowed in minor versions.
2. Existing field semantics must remain stable unless major version.
3. Derived key formulas are versioned contracts and cannot change in minor versions.

## Validation Summary
1. Reject invalid dates early.
2. Reject invalid URLs early.
3. Reject empty accession/sequence on normalized outputs.
4. Surface typed normalization errors with metadata for caller diagnostics.
