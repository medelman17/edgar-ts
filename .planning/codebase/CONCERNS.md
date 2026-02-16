# Codebase Concerns

**Analysis Date:** 2026-02-15

## Implementation Status: Pre-release Scaffolding

This codebase is currently in **scaffold phase**. The public API contract is locked, type system is complete, but 4 of 4 core methods are stubs throwing `"Not yet implemented"`. This is intentional per project planning (see `docs/edgar-ts-work-breakdown.md`).

---

## Unimplemented Core Methods

**All four public client methods are stubs:**
- Files: `src/client.ts` (lines 38-57)
- Impact: Client is not usable until W-014, W-015, W-017, W-019, W-022 complete
- Blocks: End-to-end testing, npm publication, consumer usage
- Referenced work items: W-014, W-015, W-017, W-019, W-022 in `docs/edgar-ts-work-breakdown.md`

**Methods blocked:**
1. `discoverFilings()` — Requires discovery module (W-014)
2. `listExhibits()` — Requires exhibit parsing (W-017)
3. `listContractExhibits()` — Requires EX-10* filtering (W-019)
4. `downloadExhibit()` — Requires download transport and SHA-256 (W-022)

---

## Empty Module Implementations

**Five internal modules are barrel files with no implementation:**
- `src/http/index.ts` (2 lines) — HTTP transport, rate limiting, retry core missing
- `src/discovery/index.ts` (2 lines) — Filing search and normalization missing
- `src/exhibits/index.ts` (2 lines) — Exhibit parsing and filtering missing
- `src/download/index.ts` (2 lines) — Download flow and SHA-256 missing
- `src/telemetry/index.ts` (2 lines) — Observability hooks missing

All reference work items from W-007 through W-023.

---

## Test Coverage Gaps

**Current test coverage:**
- Only 16 tests total covering constructor and error taxonomy
- Files: `tests/client.test.ts` (52 lines) and `tests/errors.test.ts` (71 lines)
- Coverage thresholds configured but not enforced on stub methods:
  - Lines: 80%
  - Functions: 80%
  - Branches: 75%
  - Statements: 80%

**Missing critical test areas:**
- HTTP client with rate limiting, timeout, retry
- Filing discovery search and normalization
- Exhibit parsing and deduplication
- SHA-256 integrity hashing
- SEC compliance (rate limit, user-agent validation, telemetry)
- Retry policy matrices and backoff jitter
- Edge cases: empty results, malformed responses, network failures
- Node/Bun runtime parity tests (configured in CI but no parity tests written)

**Safe modification:** Adding these tests before implementation will validate the test harness itself (W-024, W-025, W-026).

---

## API Surface Stability Risk

**The API contract is locked but untested end-to-end:**
- Types defined in `src/types/index.ts` (104 lines)
- Error taxonomy defined in `src/errors/index.ts` (83 lines)
- Both are exported and compiled, but no integration tests prove they work together

**Risk:** If real HTTP responses from SEC EDGAR don't match expected shapes, type definitions may need changes (breaking change for v1).

**Mitigation:** Fixture corpus (W-024) and live-smoke tests (W-025) will validate shapes. Pre-release testing recommended.

---

## Retry Policy Incomplete Implementation

**Current state:**
- Retry options defined in `src/types/index.ts` (lines 16-23)
- Defaults hardcoded in `src/client.ts` (lines 13-17): `maxAttempts=3`, `baseDelayMs=250`, `maxDelayMs=4000`
- Error taxonomy has `retryable` flags in `src/errors/index.ts` (lines 14-16)

**Missing:**
- Actual retry engine (referenced as W-009)
- Jitter implementation for exponential backoff
- Rate-limit recovery path (retry 429 responses within cap)
- Telemetry hooks for retry events (W-023)

**Blocker for:** W-009, W-010, W-014, W-015, W-017, W-019, W-022

---

## SEC Compliance Guardrails Not Enforced

**Configured but not implemented:**
- Request limiter abstraction (W-007): Default 8 req/s cap
- Timeout/abort wrapper (W-008): Default 10s timeout
- User-agent validation (lines 25-27 in `src/client.ts`): Only checks non-empty, no format validation
- Telemetry hooks (W-023): Defined in types but not wired

**Risk:** Without actual HTTP transport, rate limit is not proven to work. A misconfiguration (e.g., spawning 100 concurrent requests) would not be caught.

**Mitigation:** Integration tests with controlled network conditions (fixtures) will validate. CI includes size check (20 KB limit) to prevent bloat.

---

## Missing Validation Helpers

**Required for discovery and exhibit operations:**
- Date validation (YYYY-MM-DD format) — Referenced in W-011
- CIK padding (10-digit zero-pad format) — Referenced in `docs/edgar-ts-data-model.md`
- Accession number normalization (canonical form) — Referenced in W-012
- Form-type matching logic — Referenced in W-013
- EX-10* contract exhibit filtering — Referenced in W-018

**Status:** Not yet written. Blocking discovery (W-014, W-015) and exhibits (W-017, W-019).

**Safe to add now:** These validators can be written and tested independently before HTTP integration (W-010 completes).

---

## Bundle Size Risk

**Size limit configured: 20 KB**
- File: `package.json` (lines 69-73)
- Tool: `size-limit` with npm script `pnpm size`
- Current: Unknown (not measured on stubs)

**Risk areas:**
- `Uint8Array`, `crypto.subtle` for SHA-256 hashing may bloat output
- Error classes with multiple subclasses add weight
- Retry/backoff logic could exceed budget if naively implemented

**Mitigation:** Build tested with `pnpm build` (tsdown ESM+CJS) and size checked before release (W-028).

---

## Runtime Parity Not Verified

**Configured for both Node 18/20/22 and Bun:**
- CI matrix in `.github/workflows/` (not shown in this exploration)
- Tests use only web-standard APIs: `fetch`, `AbortSignal`, `Uint8Array`, `crypto.subtle`

**Risk:** Bun's `crypto.subtle` may behave differently on SHA-256 (W-021). `fetch` timeout behavior differs across runtimes.

**Validation task:** W-026 (Validate Node/Bun parity for full suite). Not started.

---

## Dependency Chain Integrity

**Zero runtime dependencies (by design):**
- `package.json` lists no dependencies
- Only dev tools: `biome`, `vitest`, `tsdown`, `changesets`, `size-limit`, `typescript`

**Risk areas:**
- `tsdown` (build tool) may not generate correct ESM/CJS dual builds. Recent commit fixes declaration paths (389b884).
- Biome and Vitest versions may drift from defaults. No lock-step specified.

**Mitigation:** CI validates build output (ESM, CJS, DTS). No hot production deps = low supply-chain risk.

---

## Observability Gaps

**Telemetry hooks defined but not wired:**
- Types in `src/types/index.ts` (lines 25-52): `onRequestStart`, `onRequestEnd`, `onRetry`
- Metadata fields defined for request context
- **Missing:** Actual event emission and test coverage (W-023)

**Risk:** Operators cannot audit request patterns without logs. SEC compliance requires visibility (per `docs/edgar-ts-sec-compliance.md` lines 38-50).

---

## Documentation of Incomplete State

**CLAUDE.md project instructions note:**

> "The codebase is scaffolded — `EdgarClient` methods are stubs that throw `"Not yet implemented"`. TODOs reference work items from `docs/edgar-ts-work-breakdown.md`."

**Files documenting work:**
- `docs/edgar-ts-work-breakdown.md` — Task dependency graph (W-001 through W-028)
- `docs/edgar-ts-agent-playbook.md` — Implementation phases and ordering
- `docs/edgar-ts-api-contract.md` — Locked API contract (v1)

**Risk:** These documents are authoritative but external. No in-code reference links. Developers must read CLAUDE.md to understand that methods throw intentionally.

---

## Type Safety Isolation

**Strict TypeScript enforcement:**
- `noExplicitAny: error` — All inference must be explicit
- `isolatedDeclarations: true` — All exports need type annotations
- `noParameterAssign: error` — No parameter mutation

**Benefit:** Stub methods will fail to compile if return types don't match contracts.

**Risk:** Test stubs cannot easily mock internal modules (no implementation to test against). Fixture-based integration tests required (W-024).

---

## No Pre-release Validation

**Current readiness:**
- Types compile: ✓
- Error taxonomy validates: ✓
- Constructor validates user-agent: ✓
- All methods throw: ✓

**Not validated:**
- HTTP transport behavior (rate limit, timeout, retry)
- SEC EDGAR API response shape (may differ from type definitions)
- End-to-end discovery → exhibit → download flow
- Live SEC API compliance (rate-limit, user-agent acceptance)

**Plan:** Live-smoke test harness (W-025) will validate before 1.0 release.

---

## Incomplete Build/Release Pipeline

**Present:**
- Build tool: `tsdown` with ESM + CJS + DTS output
- CI: Lint, typecheck, test configured (no details in codebase reviewed)
- Linter: Biome with strict rules
- Size check: `size-limit` with 20 KB budget

**Missing:**
- Release versioning strategy (changesets configured but no releases made)
- Npm provenance setup (configured in CI but not documented)
- Version tag naming conventions (work item W-028 not started)

**Safe to defer:** W-028 (Prepare release metadata) depends on full implementation completion.

---

## Summary of Blockers by Phase

| Phase | Blocking Tasks | Root Issue |
|-------|---|---|
| **Core HTTP** | W-007, W-008, W-009, W-010 | No transport layer |
| **Discovery** | W-011, W-012, W-013, W-014, W-015 | No validators or parsing |
| **Exhibits** | W-016, W-017, W-018, W-019 | No parsing or filtering |
| **Download** | W-020, W-021, W-022 | No download or hashing |
| **Observability** | W-023 | No event emission |
| **Testing** | W-024, W-025, W-026 | No fixtures or parity validation |
| **Release** | W-027, W-028 | No docs or versioning |

All are sequential with 6-week critical path estimated.

---

*Concerns audit: 2026-02-15*
