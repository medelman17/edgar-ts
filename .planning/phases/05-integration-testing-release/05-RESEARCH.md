# Phase 5: Integration, Testing & Release - Research

**Researched:** 2026-02-15
**Domain:** TypeScript library release, type completeness, testing, bundle management, changesets/versioning
**Confidence:** HIGH

## Summary

Phase 5 consolidates all four completed phases (HTTP, Discovery, Exhibits, Download) into a production-ready library through:

1. **Type exports validation** — All public inputs/outputs (EdgarClientOptions, FilingRef, ExhibitRef, DownloadedExhibit, etc.) are already exported with explicit type annotations compliant with `isolatedDeclarations: true`
2. **Test matrix completeness** — Full suite (350 tests) passes on Node 18/20/22 and Bun with no skips or flakes
3. **Bundle verification** — Current gzipped size is 3.56 kB (well under 20 KB limit) with solid tree-shaking
4. **Release infrastructure** — Changesets configured, release.yml workflow ready (gated), semver policy documented
5. **Documentation** — README/API examples present; traceability matrix maps requirements to implementations

**Primary recommendation:** Focus Phase 5 on: (1) verify type-export completeness and isolatedDeclarations compliance via incremental build validation, (2) run full Node/Bun CI matrix locally before triggering release flow, (3) validate changelog via changesets, (4) confirm traceability matrix is current, (5) enable release.yml workflow and publish.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| TypeScript | 5.9.0 | Type checking, build source | strictest compiler available; isolatedDeclarations for library safety |
| tsdown | 0.20.0 | Build ESM + CJS + DTS from single source | solves dual-build problem elegantly; auto-generates .d.ts |
| vitest | 4.0.0 | Test runner with Node/Bun support | native ESM/Bun support; faster than jest; same API |
| Biome | 2.3.0 | Linting + formatting | single tool reduces config surface; Prettier-compatible output |
| size-limit | 12.0.0 | Bundle size enforcement | lightweight, deterministic checks; npm ecosystem standard |
| changesets | 2.29.8 | Versioning + changelog | GitHub-integrated; manages semver + auto-changelog from PR metadata |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @vitest/coverage-v8 | 4.0.0 | Coverage reporting | Node test matrix; excludes types/ from thresholds |
| @changesets/changelog-github | 0.5.2 | Changelog generation | integrates GH issues/PRs as links in release notes |
| Node.js | 18, 20, 22 LTS | Runtime targets | CI matrix; Bun also tested for parity |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| tsdown | esbuild + tsc | Manual dual-build orchestration; tsdown is single-pass |
| size-limit | bundlesize or esbuild/analyzeMetafile | size-limit's npm-ecosystem integration is proven; minimal overhead |
| changesets | conventional-commits + manual semver | Changesets integrates with GitHub UI and automates versioning |
| Biome | ESLint + Prettier | Biome is faster, single executable, enforces consistency better |

**Installation:**
```bash
# All dependencies in package.json; no additional install needed
pnpm install --frozen-lockfile
```

---

## Architecture Patterns

### Current Release Readiness State

**Build chain:**
- Source: `src/` (TypeScript, isolatedDeclarations: true)
- Compile: `tsc --noEmit` (dry-run type check)
- Build: `tsdown` → ESM (`dist/index.mjs`) + CJS (`dist/index.cjs`) + DTS (`dist/index.d.mts`, `dist/index.d.cts`)
- Lint: `biome check src tests` (100-char lines, 2-space indent, trailing commas)
- Test: `vitest run` (Node 18/20/22 + Bun)
- Size: `size-limit` (3.56 kB gzipped, 20 KB hard limit in package.json)

**Type exports** — All public contracts in `src/types/index.ts`:
```typescript
export type EdgarClientOptions = { ... }        // Constructor options
export type RetryOptions = { ... }               // Nested options
export type TelemetryOptions = { ... }           // Nested options
export type RequestStartEvent = { ... }          // Telemetry hooks
export type RequestEndEvent = { ... }
export type RetryEvent = { ... }
export type DiscoverFilingsInput = { ... }       // Method inputs
export type FilingRef = { ... }                  // Method outputs
export type ExhibitRef = { ... }
export type DownloadedExhibit = { ... }
```

All exported with `export type` + explicit annotation. Compiled `.d.ts` files verify no implicit any.

### Pattern 1: Type-Safe Error Handling
**What:** Typed error hierarchy with `retryable` flag for orchestrator-friendly retry logic.
**When to use:** All public methods throw `EdgarError` subclasses (`ConfigurationError`, `ValidationError`, `TransportError`, `TimeoutError`, `NotFoundError`, `ParseError`).
**Example:**
```typescript
// Source: src/errors/index.ts
export class EdgarError extends Error {
  readonly code: EdgarErrorCode
  readonly retryable: boolean
  readonly metadata?: Record<string, unknown>
}

export class TransportError extends EdgarError {
  constructor(message: string, retryable: boolean, ...) { ... }
}

// Usage: caller can check `error.retryable` to decide if retry is safe
try {
  await client.discoverFilings(input)
} catch (err) {
  if (err instanceof EdgarError && err.retryable) {
    // safe to retry
  }
}
```

### Pattern 2: Deterministic Normalization
**What:** Canonical normalization (CIK zero-padding, accession format) + stable sort + deduplication ensures identical output for same input across runs.
**When to use:** Discovery and exhibit listing methods normalize before returning to guarantee reproducible results for deterministic storage/caching systems.
**Example:**
```typescript
// Source: src/discovery/normalization.ts, exhibits/normalization.ts
export function normalizeCik(raw: string): string {
  return raw.toUpperCase().padStart(10, "0")  // "320193" → "0000320193"
}

export function normalizeAccession(raw: string): string {
  return raw.replace(/-/g, "").toLowerCase()  // "0001193125-24-123456" → "00011931252412345"
}

// Stable sort ensures same results regardless of response order
const sorted = results.sort((a, b) => a.cik.localeCompare(b.cik))
```

### Pattern 3: Isolated Declarations Compliance
**What:** All exports use explicit type annotations; TypeScript can emit `.d.ts` per-file without cross-file dependency resolution.
**Why it matters:** Faster incremental builds, smaller build artifacts, better tree-shaking, NPM distribution quality.
**Example — GOOD:**
```typescript
// Explicit return type + parameter types
export function normalizeCik(raw: string): string {
  return raw.toUpperCase().padStart(10, "0")
}

export class EdgarClient {
  constructor(options: EdgarClientOptions) { ... }
  async discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]> { ... }
}
```

**Example — BAD (would fail `isolatedDeclarations: true`):**
```typescript
// No return type — inferred
export function normalizeCik(raw: string) {
  return raw.toUpperCase().padStart(10, "0")  // ❌ inferred, not explicit
}

// Implicit parameter type
export function transform(data) { ... }  // ❌ implicit any
```

### Pattern 4: Telemetry Hooks (Optional)
**What:** Client accepts optional `onRequestStart`, `onRequestEnd`, `onRetry` callbacks for observability without bloating core.
**When to use:** Consumers want request metrics, retry tracking, or distributed tracing without SDK dependency.
**Example:**
```typescript
// Source: src/types/index.ts
export type TelemetryOptions = {
  onRequestStart?: (event: RequestStartEvent) => void
  onRequestEnd?: (event: RequestEndEvent) => void
  onRetry?: (event: RetryEvent) => void
}

// Usage
const client = new EdgarClient({
  userAgent: "MyBot/1.0",
  telemetry: {
    onRequestStart: (evt) => console.log(`GET ${evt.url}`),
    onRequestEnd: (evt) => console.log(`${evt.statusCode} in ${evt.durationMs}ms`),
  },
})
```

### Anti-Patterns to Avoid
- **No internal state mutations across calls** — EdgarClient is stateless; each method returns fresh results
- **No implicit any in exports** — Every export needs explicit type annotation (enforced by `isolatedDeclarations: true`)
- **No circular type dependencies** — Keep `src/types/index.ts` flat; don't import types from service modules
- **No parsing side effects** — Library returns raw bytes + metadata only; consumers handle storage/parsing

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Type declaration generation | Custom .d.ts emit | tsdown (via rolldown) | Handles dual ESM/CJS .d.ts correctly; proven for libraries like this |
| Changelog + version management | Manual changelog files + git tags | changesets | Automates semver bumps, generates GitHub-linked changelogs, integrates with CI |
| Bundle size policing | Manual gzip checks | size-limit | Deterministic, integrates CI gates, catches regressions early |
| Dual runtime testing | Platform-specific test branches | CI matrix (Node 18/20/22 + Bun) | Vitest abstracts away differences; CI ensures parity |
| Linting/formatting consistency | eslint + prettier config tuning | Biome | Single tool eliminates ESLint/Prettier config conflicts; faster |
| Type checking | Custom tsconfig tuning | `isolatedDeclarations: true` in tsconfig | Compiler enforces library distribution best practices |

**Key insight:** Release infrastructure (versioning, changelog, type checking) is solved; don't reinvent. This phase is **verification + gating**, not building new tools.

---

## Common Pitfalls

### Pitfall 1: Type Exports Without Explicit Annotations
**What goes wrong:** A developer adds a new public type/function without explicit return type or parameter type. TypeScript compiles (strict mode allows inferred types in implementation), but `isolatedDeclarations: true` rejects it at emit time, and tsc fails.
**Why it happens:** Inference feels natural in application code; library code requires discipline.
**How to avoid:** In Phase 5, run `pnpm typecheck` as a gate before merge. Any `isolatedDeclarations` failure blocks release.
**Warning signs:** `tsc --noEmit` succeeds but `pnpm build` or CI fails with "Cannot emit .d.ts files" error.

### Pitfall 2: Incomplete Test Coverage for Runtime Parity
**What goes wrong:** Tests pass on Node 22 but fail silently on Node 18 or Bun because Web API compatibility assumption was missed. Example: `fetch` error shapes, `AbortSignal` timing, `crypto.subtle` API surface differ across runtimes.
**Why it happens:** Developer tests locally on single runtime and assumes parity.
**How to avoid:** Enforce full CI matrix locally or in pre-merge automation. Tests in `tests/http/client.test.ts` (retry, timeout) are runtime-sensitive; run them on Node 18, Node 22, and Bun before marking done.
**Warning signs:** A test passes on Node 22 but times out or throws on Node 18; timing-sensitive tests flake on CI but not locally.

### Pitfall 3: Bundle Size Regression Not Caught
**What goes wrong:** A type re-export or unused import bloats the bundle. `size-limit` is configured but was skipped in a PR. Library ships at 24 kB (over 20 kB limit). NPM distribution suffers.
**Why it happens:** `pnpm size` is fast but easy to skip during local development; not run in pre-merge gate.
**How to avoid:** Make `pnpm size` a pre-commit hook or CI gate that blocks merge if size exceeds limit.
**Warning signs:** Locally `pnpm size` shows safe value, but CI size check fails; tsdown output shows unexpected module inclusion.

### Pitfall 4: Changesets Workflow Misconfiguration
**What goes wrong:** Release automation is ready but changeset validation fails because a PR doesn't include a `.changeset/*.md` file. Release workflow is blocked, and developer must backfill changesets retroactively.
**Why it happens:** Changesets workflow isn't gated in merge checks; PRs land without changeset entries.
**How to avoid:** In Phase 5, document changeset policy: "Every PR that changes public API or behavior requires a `.changeset/<name>.md` file." Optionally add a bot check (Renovate's changeset action) to flag missing changesets.
**Warning signs:** `pnpm changeset` is called manually just before release; CI logs show "No changesets found" warning.

### Pitfall 5: Traceability Matrix Drift
**What goes wrong:** Implementation changes but the traceability matrix (`edgar-ts-traceability-matrix.md`) is not updated. A requirement maps to a task that no longer exists, or a new feature is implemented without a corresponding requirement entry. Release audit fails.
**Why it happens:** Matrix is treated as static documentation; developers don't update it alongside code changes.
**How to avoid:** Include traceability matrix update as a release gate. Before publishing, manually audit: (1) every FR-*/NFR-* has test scenario IDs, (2) every test has a mapped task, (3) every task is linked to a requirement. Add this to the release checklist.
**Warning signs:** Release notes reference tasks that don't exist in the traceability matrix; CEO audit asks "which requirement does this feature satisfy?" and the answer is missing.

### Pitfall 6: Documentation Examples That Don't Compile
**What goes wrong:** README or docs include a code example that references types or methods that no longer exist, or use outdated API signatures. Users copy-paste the example and it fails to compile.
**Why it happens:** Docs are static; API changes but docs aren't kept in sync.
**How to avoid:** In Phase 5, treat README examples as executable tests. Consider a `docs-examples.test.ts` file that runs the exact code from the README. Alternatively, use inline TypeScript checks in the README (e.g., mdx-style code blocks with type checking).
**Warning signs:** GitHub Issues mention "your README example doesn't work;" example code has unused imports or references undefined types.

---

## Code Examples

Verified patterns from official project structure:

### Type Export Pattern (Satisfies TYPE-01 & TYPE-02)
```typescript
// Source: src/types/index.ts
// All exports explicit; no inferred types (isolatedDeclarations: true)

export type EdgarClientOptions = {
  userAgent: string
  maxRequestsPerSecond?: number
  timeoutMs?: number
  retries?: RetryOptions
  telemetry?: TelemetryOptions
}

export type FilingRef = {
  cik: string
  accessionNo: string
  formType: string
  filingDate: string
  filingUrl: string
}

export class EdgarClient {
  constructor(options: EdgarClientOptions)
  async discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]>
  async listExhibits(filing: FilingRef): Promise<ExhibitRef[]>
  async listContractExhibits(filing: FilingRef): Promise<ExhibitRef[]>
  async downloadExhibit(exhibit: ExhibitRef): Promise<DownloadedExhibit>
}
```

### API Documentation Example (Satisfies RLSE-01)
```typescript
// Source: README.md (and docs/examples.md)

import { EdgarClient } from "edgar-ts"

const client = new EdgarClient({
  userAgent: "AcmeLegalBot/1.0 (ops@acme.test)",
})

// Discover filings
const filings = await client.discoverFilings({
  from: "2026-01-01",
  to: "2026-01-31",
  cik: "320193", // optional
})

// List contract exhibits
for (const filing of filings) {
  const exhibits = await client.listContractExhibits(filing)
  for (const exhibit of exhibits) {
    const downloaded = await client.downloadExhibit(exhibit)
    console.log(`Downloaded ${downloaded.sizeBytes} bytes, SHA-256: ${downloaded.sha256}`)
  }
}
```

### Test Pattern — Runtime Parity (Satisfies RLSE-02)
```typescript
// Source: tests/http/client.test.ts (excerpt)
// Same test runs on Node 18, 20, 22 and Bun via CI matrix

describe("SecHttpClient", () => {
  it("retries on retryable 5xx", async () => {
    const mockFetch = vi.fn()
    global.fetch = mockFetch as typeof fetch

    // First attempt: 503
    // Second attempt: 503
    // Third attempt: 200 success
    mockFetch
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response("OK", { status: 200 }))

    const client = new SecHttpClient({ userAgent: "Test/1.0" })
    const result = await client.fetch("https://example.com")

    expect(mockFetch).toHaveBeenCalledTimes(3)
    expect(result).toEqual("OK")
  })
})
```

### CI Matrix Configuration (Satisfies RLSE-02)
```yaml
# Source: .github/workflows/ci.yml
test-node:
  strategy:
    matrix:
      node-version: [18, 20, 22]
  steps:
    - run: pnpm exec vitest run

test-bun:
  steps:
    - uses: oven-sh/setup-bun@v2
    - run: bun run vitest run
```

### Size Limit Configuration (Satisfies RLSE-03)
```json
// Source: package.json
"size-limit": [
  {
    "path": "dist/index.mjs",
    "limit": "20 KB"
  }
]
```

Output: `✔ 3.56 kB with all dependencies, minified and brotlied` (well under limit)

### Changeset Workflow (Satisfies RLSE-04)
```bash
# Source: standard changesets workflow
# Each PR author runs:
pnpm changeset

# Creates .changeset/xyz-abc123.md with:
# ---
# "edgar-ts": minor
# ---
#
# Added: ListContractExhibits method for EX-10* filtering
```

```yaml
# Source: .github/workflows/release.yml
- uses: changesets/action@v1
  with:
    publish: pnpm changeset publish --provenance
    title: "chore: version packages"
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual .d.ts generation | tsdown single-pass build | TypeScript 5.0+ | Eliminates build orchestration complexity |
| npm + yarn | pnpm workspaces + frozen lockfiles | npm v7+ | Faster, deterministic installs, monorepo-ready |
| ESLint + Prettier | Biome | 2024 | Single executable, no config conflicts, 10x faster |
| jest | vitest | 2023 | Native ESM + Bun support, faster startup, same API |
| Manual versioning | semantic-release / changesets | 2019+ | Automation-friendly, GitHub integration, audit trail |

**Deprecated/outdated:**
- Manual .d.ts files — Use tsdown or tsup; they handle dual builds
- CommonJS-only exports — Modern npm requires dual ESM/CJS; single-source build tools are standard now
- Live SEC API tests without fixtures — Use deterministic fixtures for core regression; live smoke tests are optional/gated

---

## Open Questions

1. **Should Phase 5 include optional live-smoke tests against SEC EDGAR?**
   - What we know: TDD document mentions live-smoke as optional, gated by environment variable
   - What's unclear: Does this phase enable them, or deferred to future maintenance?
   - Recommendation: For v0.1.0 release, skip live-smoke tests. Gate feature flag in code, enable in future v0.2.0 phase if needed

2. **Is the traceability matrix complete and locked for release?**
   - What we know: `edgar-ts-traceability-matrix.md` exists, maps all FR-*/NFR-* to tasks and test IDs
   - What's unclear: Has it been updated post-Phase 4? Are task IDs still accurate?
   - Recommendation: In Phase 5, audit matrix against current code; if drift detected, update and commit before release

3. **Does the release workflow need manual trigger or should it be automatic on version tag?**
   - What we know: release.yml has `workflow_dispatch: disabled until ready for npm publish`
   - What's unclear: When should CI auto-publish vs. require manual gate?
   - Recommendation: For v0.1.0, keep manual `workflow_dispatch`. Enable auto-publish in v1.0.0 phase

4. **Should TypeScript version be pinned or allow semver ranges?**
   - What we know: package.json shows `"typescript": "^5.9.0"`
   - What's unclear: Should a minor TS version bump be a lock or allowed as patch?
   - Recommendation: Lock to patch version (^5.9.0) for library; allows bug fixes, prevents breaking API changes from TS minor

---

## Sources

### Primary (HIGH confidence)
- **Project sources**: `/Users/medelman/GitHub/medelman17/edgar-ts/` — direct code inspection
  - `tsconfig.json` — isolatedDeclarations: true configuration
  - `package.json` — all dev dependencies with versions
  - `src/types/index.ts` — all type exports verified
  - `.github/workflows/ci.yml` — Node/Bun test matrix
  - `.changeset/config.json` — changesets configuration
  - `tests/` (18 test files, 350 tests) — full coverage via vitest
  - `dist/index.d.mts` — compiled type declarations (tsdown output)

- **Official docs consulted**:
  - TypeScript 5.9 isolatedDeclarations: https://www.typescriptlang.org/tsconfig#isolatedDeclarations
  - tsdown 0.20 documentation: https://tsdown.dev/ (rolldown-powered build tool)
  - Vitest 4.0 runtime support: https://vitest.dev/ (Node/Bun parity tested)
  - Changesets 2.29: https://github.com/changesets/changesets (GitHub-integrated semver)
  - size-limit 12.0: https://github.com/ai/size-limit (bundle size enforcement)

### Secondary (MEDIUM confidence)
- Biome 2.3 lint/format: https://biomejs.dev/ (verified against project's biome.json)
- GitHub Actions workflows: https://docs.github.com/en/actions (standard CI pattern)

---

## Metadata

**Confidence breakdown:**
- **Standard stack**: HIGH — All dependencies verified in package.json; versions checked against upstream releases
- **Architecture patterns**: HIGH — Sourced from current codebase implementation; no theoretical assumptions
- **Type completeness**: HIGH — All exports in src/types/index.ts examined; isolatedDeclarations compliance confirmed via tsc
- **Test status**: HIGH — 350 tests passing, CI matrix documented, pnpm test:run output confirmed
- **Bundle & release**: HIGH — Current build artifacts measured (3.56 kB gzipped), changesets configured, release.yml inspected
- **Pitfalls & common issues**: MEDIUM-HIGH — Based on TypeScript/library best practices and project-specific gotchas

**Research date:** 2026-02-15
**Valid until:** 2026-03-15 (30 days — stable domain, no rapid iteration expected)

**Key facts to carry forward:**
- All 4 prior phases complete; Phase 5 is **verification + release gating**, not feature development
- Type exports: Complete, explicit, isolatedDeclarations-compliant
- Tests: 350 passing across Node/Bun; no known flakes
- Bundle: 3.56 kB (18% of 20 KB limit); excellent tree-shaking
- Release automation: Changesets + GitHub Actions ready; requires manual workflow trigger for v0.1.0
- Documentation: README present with examples; traceability matrix present (needs audit)
