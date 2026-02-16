# CLAUDE.md

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
pnpm size             # Check bundle size
pnpm changeset        # Create a changeset for versioning
```

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

## Code Style

- **Biome**: 100-char lines, double quotes, trailing commas, ASI-safe semicolons
- **`noExplicitAny: error`** — use `unknown` + type narrowing
- **`isolatedDeclarations: true`** — all exports need explicit type annotations
- **Path alias**: `@/*` maps to `src/*`
- **Barrel exports**: Every module directory has `index.ts`
- **Tests mirror src**: `src/foo/bar.ts` → `tests/foo/bar.test.ts`

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

Implementation specs in `docs/`:
- `edgar-ts-prd.md` — Requirements and user stories
- `edgar-ts-architecture.md` — Module design
- `edgar-ts-api-contract.md` — Locked API types and method contracts
- `edgar-ts-data-model.md` — Identity and normalization rules
- `edgar-ts-error-retry.md` — Error taxonomy and retry policy
- `edgar-ts-tdd.md` — Test strategy
- `edgar-ts-work-breakdown.md` — Task dependency graph
- `edgar-ts-agent-playbook.md` — Implementation phases

## CI & Releases

- **CI**: Lint + typecheck + test (Node 18/20/22 + Bun) + build + size check
- **Releases**: Changesets → merge to main → Version Packages PR → npm publish with provenance
- **Code review**: Claude Code auto-reviews PRs
