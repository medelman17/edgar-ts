---
phase: 04-exhibit-download-integrity-verification
plan: 01
subsystem: download
tags: [sha256, download, integrity, nist-vectors, binary-handling]
dependency-graph:
  requires:
    - SecHttpClient (from Phase 1)
    - ExhibitRef type (from Phase 3)
  provides:
    - computeSha256Hex utility (NIST-verified)
    - DownloadService orchestrator
    - DownloadedExhibit metadata structure
  affects:
    - EdgarClient.downloadExhibit() (unblocked for Phase 5)
tech-stack:
  added:
    - crypto.subtle.digest (Web Crypto API for SHA-256)
    - ArrayBuffer/Uint8Array binary handling
  patterns:
    - Service class with httpClient DI (mirrors DiscoveryService/ExhibitService)
    - Unknown casting for response type narrowing (arrayBuffer() method)
    - NIST test vector verification for cryptographic correctness
key-files:
  created:
    - src/download/hasher.ts (SHA-256 computation)
    - src/download/service.ts (DownloadService orchestrator)
    - tests/download/hasher.test.ts (7 tests - NIST vectors + format validation)
    - tests/download/service.test.ts (11 tests - metadata extraction + binary handling)
  modified:
    - src/download/index.ts (barrel exports)
decisions:
  - decision: Use crypto.subtle.digest for SHA-256
    rationale: Native Web Crypto API available in Node 18+/Bun; zero-dependency requirement; NIST FIPS 180-4 compliant
    status: applied
  - decision: Unknown casting for arrayBuffer() response method
    rationale: Mirrors Phase 2 json() and Phase 3 text() patterns; HttpResponse type lacks arrayBuffer() method; avoids explicit any
    status: applied
  - decision: Use bytes.length for sizeBytes (not Content-Length header)
    rationale: Content-Length may be absent or incorrect; actual bytes.length is source of truth
    status: applied
  - decision: Optional MIME type extraction from Content-Type header
    rationale: Content-Type may be absent; strip charset parameter for canonical MIME type
    status: applied
metrics:
  duration: 157s
  tasks: 2
  files: 5
  tests: 18 (7 hasher + 11 service)
  commits: 2
  completed: 2026-02-16T04:38:05Z
---

# Phase 04 Plan 01: Raw Exhibit Download & Integrity Verification Summary

**One-liner:** SHA-256 integrity verification with NIST test vectors and binary download orchestration using crypto.subtle.

## Overview

Implemented raw exhibit download with cryptographic integrity verification. The DownloadService orchestrates the complete download flow: fetch exhibit bytes via SecHttpClient, extract optional MIME type from Content-Type header, compute SHA-256 digest using Web Crypto API, and return DownloadedExhibit with complete metadata.

All 18 tests pass including 3 NIST FIPS 180-4 test vectors (empty input, "abc", 56-byte input) and 11 service integration tests covering metadata extraction, binary handling, and edge cases.

## Tasks Completed

### Task 1: SHA-256 Hasher with NIST Test Vectors (Commit: c1c11b0)

**Delivered:**
- `computeSha256Hex(data: Uint8Array): Promise<string>` utility function
- Uses crypto.subtle.digest("SHA-256", data) for NIST FIPS 180-4 compliant hashing
- Returns lowercase hexadecimal digest (64 characters)
- ArrayBuffer to hex conversion using byte.toString(16).padStart(2, "0")

**Tests (7 total):**
- ✅ NIST test vector: empty input → e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
- ✅ NIST test vector: "abc" → ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
- ✅ NIST test vector: 56-byte input → 248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1
- ✅ Lowercase hexadecimal format (no uppercase, no separators)
- ✅ Uint8Array input handling (not just strings)
- ✅ Different inputs produce different digests
- ✅ Identical inputs produce same digest (determinism)

**Files:**
- `src/download/hasher.ts` (40 lines)
- `tests/download/hasher.test.ts` (76 lines)
- `src/download/index.ts` (updated barrel export)

### Task 2: DownloadService Orchestrator (Commit: bd481cd)

**Delivered:**
- `DownloadService` class with httpClient dependency injection
- `downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit>` method
- Complete orchestration flow:
  1. Fetch exhibit.exhibitUrl via SecHttpClient
  2. Extract optional MIME type from Content-Type header (strip charset)
  3. Convert response.arrayBuffer() to Uint8Array
  4. Compute SHA-256 digest using computeSha256Hex
  5. Return DownloadedExhibit with all metadata

**Tests (11 total):**
- ✅ Returns DownloadedExhibit with all required fields
- ✅ Uses exhibit.exhibitUrl for fetch
- ✅ Extracts MIME type from Content-Type header
- ✅ Strips charset parameter from MIME type
- ✅ Sets mimeType to undefined when Content-Type missing
- ✅ sizeBytes matches actual bytes.length
- ✅ Computes SHA-256 digest correctly (verified with "abc" test vector)
- ✅ Bytes are exact binary from response (no transformation)
- ✅ Returns exhibit reference in result
- ✅ Handles empty file correctly (0 bytes, empty SHA-256 vector)
- ✅ Handles large binary data correctly (10KB test)

**Files:**
- `src/download/service.ts` (56 lines)
- `tests/download/service.test.ts` (233 lines)
- `src/download/index.ts` (updated barrel export)

## Deviations from Plan

None - plan executed exactly as written.

## Architecture

**Module structure:**
```
src/download/
├── hasher.ts       # SHA-256 computation (Web Crypto API)
├── service.ts      # DownloadService orchestrator
└── index.ts        # Barrel exports

tests/download/
├── hasher.test.ts  # NIST test vectors + format validation
└── service.test.ts # Integration tests with mocked SecHttpClient
```

**Key patterns:**
- Service class with constructor dependency injection (mirrors DiscoveryService/ExhibitService)
- Unknown casting for response type narrowing: `as unknown as { arrayBuffer(): Promise<ArrayBuffer>, headers: { get(name: string): string | null } }`
- NIST test vector verification for cryptographic correctness
- Always use bytes.length for size (not Content-Length header)

## Test Coverage

**Total: 18 tests across 2 test files**

**Hasher tests (7):**
- 3 NIST FIPS 180-4 test vectors (empty, "abc", 56-byte)
- Format validation (lowercase, 64 chars, hex only)
- Uint8Array input handling
- Determinism verification

**Service tests (11):**
- All DownloadedExhibit fields present
- Correct exhibit URL usage
- MIME type extraction (with and without charset)
- MIME type undefined when header missing
- sizeBytes matches bytes.length
- SHA-256 digest correctness (verified with known vector)
- Binary data integrity (no transformation)
- Exhibit reference preservation
- Edge cases (empty file, large binary data)

## Integration Points

**Dependencies:**
- `SecHttpClient` (Phase 1) - Rate-limited HTTP transport
- `ExhibitRef` type (Phase 3) - Exhibit metadata with URL

**Provides:**
- `computeSha256Hex` utility - NIST-verified SHA-256 hashing
- `DownloadService` - Complete download orchestration
- `DownloadedExhibit` type - Raw bytes + metadata + integrity hash

**Unblocks:**
- `EdgarClient.downloadExhibit()` - Ready for Phase 5 integration

## Performance

- **Duration:** 157 seconds (2m 37s)
- **Tasks:** 2/2 completed
- **Tests:** 18 total (all passing)
- **Commits:** 2 atomic commits
- **Full test suite:** 343 tests passing (no regressions)

## Next Steps (Phase 5)

1. Wire DownloadService to EdgarClient
2. Update EdgarClient.downloadExhibit() to delegate to DownloadService
3. Integration tests for full discovery → exhibit → download flow
4. Documentation and release preparation

## Commits

1. **c1c11b0** - feat(04-01): implement SHA-256 hasher with NIST test vectors
   - computeSha256Hex utility using crypto.subtle.digest
   - 7 tests including 3 NIST FIPS 180-4 test vectors

2. **bd481cd** - feat(04-01): implement DownloadService with binary response handling
   - DownloadService orchestrator class
   - downloadExhibit() complete flow
   - 11 service tests covering metadata extraction and binary handling

## Self-Check: PASSED

**Files created:**
- ✅ src/download/hasher.ts exists
- ✅ src/download/service.ts exists
- ✅ tests/download/hasher.test.ts exists
- ✅ tests/download/service.test.ts exists

**Commits exist:**
- ✅ c1c11b0 found in git log
- ✅ bd481cd found in git log

**Tests passing:**
- ✅ 18 download module tests pass
- ✅ 343 total tests pass (no regressions)
- ✅ Typecheck clean
- ✅ Lint clean (no new issues)
