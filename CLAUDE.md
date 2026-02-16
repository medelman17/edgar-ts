# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

**edgar-ts** is a TypeScript library for SEC EDGAR filing discovery and contract exhibit acquisition. It provides a high-level `EdgarClient` with SEC-compliant rate limiting, retry, and deterministic normalization.

## Commands

```bash
pnpm install          # Install dependencies
pnpm test             # Run tests (watch mode)
pnpm test:run         # Run tests once
pnpm build            # Build with tsdown (ESM + CJS + DTS)
pnpm typecheck        # Type check
pnpm lint             # Lint with Biome
pnpm format           # Format with Biome
pnpm check            # Biome lint + format combined
pnpm size             # Check bundle size (limit: 20 KB)
pnpm changeset        # Create a changeset for versioning
```

Run a single test file: `pnpm vitest run tests/client.test.ts`
Run tests matching a name: `pnpm vitest run -t "rejects empty"`

## Architecture

```
src/
├── client.ts          # EdgarClient — public facade
├── types/             # Public type contracts
├── errors/            # Typed error taxonomy with retryability
├── http/              # SEC HTTP client (rate limit, retry, timeout)
├── discovery/         # Filing discovery and normalization
├── exhibits/          # Exhibit parsing and EX-10* filtering
├── download/          # Raw exhibit download + SHA-256
├── telemetry/         # Optional observability hooks
└── index.ts           # Barrel export
```

### Module Boundaries

- `EdgarClient` delegates to internal modules — never contains heavy logic directly
- `SecHttpClient` owns all transport concerns (rate limiting, retry, timeout, headers)
- Errors are typed with `retryable` flags for orchestrator-friendly handling
- No persistence, no parsing — library returns raw bytes + metadata

## Implementation Status

The codebase is scaffolded — `EdgarClient` methods are stubs that throw `"Not yet implemented"`. TODOs reference work items from `docs/edgar-ts-work-breakdown.md` (e.g., `W-014`, `W-017`). The `http/`, `discovery/`, `exhibits/`, `download/`, and `telemetry/` modules export empty barrel files awaiting implementation.

## Code Style

- **Biome**: 100-char lines, 2-space indent, double quotes, trailing commas, semicolons only as needed (ASI-safe)
- **`noExplicitAny: error`** — use `unknown` + type narrowing
- **`noParameterAssign: error`** — never reassign function parameters
- **`isolatedDeclarations: true`** — all exports need explicit type annotations
- **Path alias**: `@/*` maps to `src/*` (configured in both `tsconfig.json` and `vitest.config.ts`)
- **Barrel exports**: Every module directory has `index.ts`
- **Tests**: Vitest with globals enabled. Tests live in `tests/` mirroring `src/` structure. Imports use `@/` alias.

## API Surface (v1)

```ts
const client = new EdgarClient({ userAgent: "Bot/1.0 (you@example.com)" })

client.discoverFilings({ from, to, cik?, formTypes? }) → FilingRef[]
client.listExhibits(filing)                           → ExhibitRef[]
client.listContractExhibits(filing)                   → ExhibitRef[]  // EX-10* only
client.downloadExhibit(exhibit)                       → DownloadedExhibit
```

## Key Constraints

1. **SEC compliance**: Mandatory user-agent, default 8 req/s cap, bounded retries
2. **Deterministic output**: Canonical normalization, stable sort, deduplication
3. **Zero runtime deps**: Everything self-contained
4. **Node + Bun parity**: Web-standard APIs only (`fetch`, `AbortSignal`, `Uint8Array`, `crypto.subtle`)

## Planning Docs

Implementation specs in `docs/`. Start with the **agent playbook** and **work breakdown** for task sequencing, then consult specific docs as needed:

- `edgar-ts-agent-playbook.md` — Implementation phases and ordering
- `edgar-ts-work-breakdown.md` — Task dependency graph (W-001 through W-0xx)
- `edgar-ts-api-contract.md` — Locked API types and method contracts
- `edgar-ts-architecture.md` — Module design
- `edgar-ts-prd.md` — Requirements and user stories
- `edgar-ts-data-model.md` — Identity and normalization rules (CIK padding, accession format)
- `edgar-ts-error-retry.md` — Error taxonomy and retry policy
- `edgar-ts-tdd.md` — Test strategy
- `edgar-ts-sec-compliance.md` — SEC rate limits and user-agent requirements

## CI & Releases

- **CI**: Lint + typecheck + test (Node 18/20/22 + Bun) + build + size check
- **Releases**: Changesets → merge to main → Version Packages PR → npm publish with provenance
- **Code review**: Claude Code auto-reviews PRs
