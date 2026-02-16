# Technology Stack

**Analysis Date:** 2026-02-15

## Languages

**Primary:**
- TypeScript 5.9.0 - All source and test code, strict mode enabled

**Secondary:**
- JavaScript (via tsdown build output) - Generated ESM and CJS artifacts

## Runtime

**Environment:**
- Node.js 18.0.0 or higher
- Bun (tested via CI, web-standard APIs only)

**Package Manager:**
- pnpm 10.6.5
- Lockfile: `pnpm-lock.yaml` (present)

## Frameworks

**Core:**
- None (zero runtime dependencies) - Pure TypeScript library using Node.js standard library

**Testing:**
- Vitest 4.0.0 - Test runner with globals enabled, 10s test timeout
- @vitest/coverage-v8 4.0.0 - Code coverage reporting (text, JSON, HTML)

**Build/Dev:**
- tsdown 0.20.0 - Multi-format bundler (ESM, CJS, declaration files)
- TypeScript 5.9.0 - Compiler with isolatedDeclarations enabled
- Biome 2.3.0 - Linter and formatter (replaces separate ESLint + Prettier)

## Key Dependencies

**Critical:**
- None (zero runtime dependencies) - Library self-contained

**Infrastructure:**
- @biomejs/biome 2.3.0 - Code quality (linting + formatting)
- @changesets/cli 2.29.8 - Semantic versioning and release management
- @changesets/changelog-github 0.5.2 - GitHub changelog generation
- @size-limit/preset-small-lib 12.0.0 - Bundle size enforcement (20 KB limit)
- size-limit 12.0.0 - Size checking for production builds

## Configuration

**Environment:**
- Configured via constructor options: `userAgent` (required), `maxRequestsPerSecond`, `timeoutMs`, `retries`, `telemetry`
- No environment variables required for basic operation
- SEC compliance: mandatory user-agent header, default 8 requests/second rate limit

**Build:**
- `tsdown.config.ts` - Multi-format output (ESM at `dist/index.mjs`, CJS at `dist/index.cjs`, declarations at `dist/index.d.mts` and `dist/index.d.cts`)
- `tsconfig.json` - TypeScript strict mode, ES2022 target, path alias `@/*` maps to `src/*`
- `biome.json` - 100-char line width, 2-space indent, double quotes, trailing commas, ASI-safe semicolons
- `vitest.config.ts` - Node.js environment, coverage targets (80% lines/functions/statements, 75% branches)

## Platform Requirements

**Development:**
- Node.js ≥18.0.0
- pnpm 10.6.5
- Git for version control and changesets

**Production:**
- Node.js ≥18.0.0 (or Bun)
- Published to npm as dual ESM/CJS package
- No external dependencies, no database, no network services required beyond SEC EDGAR HTTP API

## Code Quality & Linting

**Linting Rules:**
- `noExplicitAny: error` - Enforce typed parameters with `unknown` + type narrowing
- `noImplicitAnyLet: error` - Variables must have explicit types
- `noParameterAssign: error` - Function parameters never reassigned
- `useConst: error` - Prefer `const` over `let`
- `noNonNullAssertion: warn` - Discourage `!` operator
- `noForEach: off` - forEach allowed

**TypeScript Settings:**
- Strict mode: `true`
- Isolated declarations: `true` (all exports must have explicit type annotations)
- Declaration maps: `true` (source maps for `.d.ts` files)
- Module resolution: `bundler` (modern resolution strategy)
- Source maps: Generated for minified output

## Export Format

**Package Exports:**
- Main entry: `./dist/index.cjs` (CommonJS)
- Module entry: `./dist/index.mjs` (ECMAScript)
- Type declarations: `./dist/index.d.mts` (ESM types), `./dist/index.d.cts` (CJS types)
- Dual-format ESM/CJS with compatible declarations for both environments
- Side effects: `false` (tree-shakeable)

## CI/Release Pipeline

**Testing Environments:**
- Node 18, 20, 22 (GitHub Actions matrix)
- Bun (latest)

**Build Artifacts:**
- Minified dual-format bundles
- Source maps for debugging
- Bundle size limit: 20 KB (enforced via `size-limit`)

**Versioning:**
- Changesets-based semantic versioning
- GitHub changelog generation
- npm publishing with provenance

---

*Stack analysis: 2026-02-15*
