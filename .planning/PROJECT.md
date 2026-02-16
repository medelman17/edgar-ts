# edgar-ts

## What This Is

A TypeScript library for SEC EDGAR filing discovery and contract exhibit acquisition. It provides a high-level `EdgarClient` with SEC-compliant rate limiting, retry, and deterministic normalization. Targets Node.js and Bun runtimes with zero runtime dependencies.

## Core Value

Reliable, automatable access to SEC EDGAR contract exhibits (`EX-10*`) with deterministic output and SEC-compliant request behavior.

## Requirements

### Validated

<!-- Shipped and confirmed valuable. -->

- ✓ Repository scaffold with pnpm, TypeScript 5.9, Biome, Vitest — existing
- ✓ Dual ESM/CJS build via tsdown with declaration files — existing
- ✓ CI matrix for Node 18/20/22 + Bun — existing
- ✓ Public type contracts (`EdgarClientOptions`, `FilingRef`, `ExhibitRef`, `DownloadedExhibit`) — existing
- ✓ `EdgarClient` constructor with validation (rejects empty/missing userAgent) — existing
- ✓ Typed error taxonomy with retryability flags (7 error subclasses) — existing
- ✓ Bundle size enforcement (20 KB limit via size-limit) — existing
- ✓ Changesets-based versioning infrastructure — existing

### Active

<!-- Current scope. Building toward these. -->

- [ ] SEC HTTP client with rate limiting, retry, timeout, and abort support
- [ ] Filing discovery (`discoverFilings`) with date/CIK filtering, normalization, dedupe, stable sort
- [ ] Exhibit enumeration (`listExhibits`) with normalized, deduplicated output
- [ ] Contract exhibit filtering (`listContractExhibits`) for `EX-10*` types
- [ ] Exhibit download (`downloadExhibit`) with raw bytes, metadata, and SHA-256 integrity hash
- [ ] Structured telemetry hooks for request lifecycle observability
- [ ] Fixture corpus and snapshot baselines for integration tests
- [ ] Node/Bun runtime parity validation
- [ ] API documentation with copy-paste examples
- [ ] Release readiness (changelog, version tag, traceability matrix)

### Out of Scope

<!-- Explicit boundaries. Includes reasoning to prevent re-adding. -->

- Document parsing, OCR, or text extraction — library returns raw bytes only
- XBRL or financial statement analysis — not in mission scope
- Browser runtime support — Node + Bun only
- Multi-registry support beyond SEC EDGAR — single-source focus
- CLI or UI tooling — library-only deliverable
- Persistence/storage adapters — consumers handle storage
- Non-`EX-10*` exhibit filtering — additive future feature if needed
- OAuth/authentication — SEC EDGAR is unauthenticated

## Context

The codebase is scaffolded with working build, lint, typecheck, and test infrastructure. `EdgarClient` methods are stubs that throw "Not yet implemented". Internal modules (`http/`, `discovery/`, `exhibits/`, `download/`, `telemetry/`) export empty barrel files awaiting implementation.

Comprehensive planning docs exist in `docs/` covering:
- PRD with 20 functional requirements and 10 non-functional requirements
- Agent playbook with 8 execution phases
- Work breakdown with 28 tasks and dependency graph
- API contract, data model, error/retry policy, SEC compliance, TDD strategy
- Architecture design records (ADRs) for discovery, exhibit dedupe, and runtime packaging

The library is designed for legal-tech and compliance teams building SEC filing ingestion pipelines in TypeScript.

## Constraints

- **SEC compliance**: Mandatory user-agent header, default 8 req/s cap, bounded retries with jittered backoff
- **Zero runtime deps**: Everything self-contained, no heavyweight framework lock-in
- **Node + Bun parity**: Web-standard APIs only (`fetch`, `AbortSignal`, `Uint8Array`, `crypto.subtle`)
- **Deterministic output**: Canonical normalization, stable sort, deduplication across all operations
- **isolatedDeclarations**: All exports require explicit type annotations
- **Bundle size**: 20 KB limit enforced in CI

## Key Decisions

<!-- Decisions that constrain future work. Add throughout project lifecycle. -->

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| High-level `EdgarClient` facade pattern | Low adoption friction, hides transport complexity | — Pending |
| Token-bucket rate limiter in `SecHttpClient` | Simple, predictable, SEC-compliant default behavior | — Pending |
| Typed error hierarchy with `retryable` flags | Enables orchestrator-level retry decisions without parsing error messages | — Pending |
| Fixture-based integration tests | Avoids upstream volatility, enables offline development | — Pending |
| `EX-10*` only for v1 contract filtering | Tight scope, covers primary use case, additive expansion later | — Pending |
| Phase 0 treated as complete | Repo scaffold, CI, types, error taxonomy, client skeleton already exist | ✓ Good |

---
*Last updated: 2026-02-15 after initialization*
