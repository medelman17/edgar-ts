# Coding Conventions

**Analysis Date:** 2026-02-15

## Naming Patterns

**Files:**
- Lowercase with hyphens for directories: `src/http/`, `src/errors/`, `src/discovery/`
- PascalCase for class names: `EdgarClient`, `EdgarError`, `ConfigurationError`
- camelCase for functions and variables: `userAgent`, `maxRequestsPerSecond`, `retryable`
- SCREAMING_SNAKE_CASE for constants: `DEFAULT_MAX_REQUESTS_PER_SECOND`, `DEFAULT_TIMEOUT_MS`, `DEFAULT_RETRY`
- Index files: Every module directory has `index.ts` for barrel exports

**Functions:**
- camelCase naming: `discoverFilings()`, `listExhibits()`, `downloadExhibit()`
- Descriptive verb-first naming convention: `discoverFilings`, `listContractExhibits`
- Private fields prefixed with `readonly` and `private` modifiers: `private readonly options`

**Variables:**
- camelCase for all variables and parameters: `userAgent`, `maxAttempts`, `baseDelayMs`
- Suffix with unit for time measurements: `timeoutMs`, `baseDelayMs`, `maxDelayMs`, `durationMs`
- Suffix with unit for size measurements: `sizeBytes`, `lineWidth`, `indentWidth`
- Boolean flags use `is` or `no` prefix rarely; typically just the property name: `retryable` (not `isRetryable`)

**Types:**
- PascalCase for type/interface names: `EdgarClientOptions`, `FilingRef`, `ExhibitRef`, `DownloadedExhibit`
- PascalCase for error classes: `EdgarError`, `ConfigurationError`, `ValidationError`, `TransportError`
- Discriminated union for error codes: `EdgarErrorCode` type with literal string values

**Type Properties:**
- camelCase for all type properties: `userAgent`, `maxRequestsPerSecond`, `accessionNo`, `exhibitUrl`
- Document types with JSDoc comments for all public properties (see `src/types/index.ts`)

## Code Style

**Formatting:**
- Tool: Biome
- Line width: 100 characters (configured in `biome.json`)
- Indent: 2 spaces
- Quote style: Double quotes (`"`)
- Trailing commas: All (enabled in `biome.json`)
- Semicolons: As needed (ASI-safe; Biome config: `"asNeeded"`)

**Linting:**
- Tool: Biome
- Recommended rules enabled (biome.json line 13)
- Key rules enforced:
  - `noExplicitAny: error` — All `any` types are forbidden; use `unknown` + type narrowing
  - `noImplicitAnyLet: error` — Variables must have explicit type annotations
  - `noParameterAssign: error` — Function parameters are never reassigned; use local variables instead
  - `useConst: error` — Prefer `const` over `let` for non-reassigned variables
  - `noNonNullAssertion: warn` — Non-null assertions (`!`) are discouraged but permitted
  - `noForEach: off` — Array `.forEach()` is permitted (not required to use `.map()` or `for...of`)

**TypeScript Strict Mode:**
- `strict: true` — All type checking enabled
- `isolatedDeclarations: true` — All exports must have explicit type annotations
- Target: ES2022 with ES2022 lib
- Module resolution: `bundler` (modern Node/bundler semantics)
- Path aliases: `@/*` maps to `src/*` (configured in `tsconfig.json` and `vitest.config.ts`)

## Import Organization

**Order:**
1. Built-in imports (`"node:*"`)
2. Type imports (from dependencies and relative paths): `import type { X } from "..."`
3. Value imports: `import { Y } from "..."`
4. Relative imports organized: `@/` alias imports → relative imports (`./`, `../`)

**Path Aliases:**
- Always use `@/` for imports within `src/`: `import { EdgarClient } from "@/client"`, `import type { FilingRef } from "@/types"`
- Never use relative paths (`../../../`) within src/

**Example from `src/client.ts`:**
```typescript
import { ConfigurationError } from "@/errors"
import type {
  DiscoverFilingsInput,
  DownloadedExhibit,
  EdgarClientOptions,
  ExhibitRef,
  FilingRef,
  RetryOptions,
} from "@/types"
```

**Biome assists:** Imports are automatically organized via Biome's `organizeImports` action (biome.json line 6).

## Error Handling

**Patterns:**
- Use typed error hierarchy from `src/errors/index.ts`
- Base class `EdgarError` extends `Error` with `code`, `retryable`, and optional `metadata` properties
- Each error type maps to a specific `EdgarErrorCode` with fixed retryability:
  - `ConfigurationError`: `code = "CONFIGURATION_ERROR"`, `retryable = false`
  - `ValidationError`: `code = "VALIDATION_ERROR"`, `retryable = false`
  - `TransportError`: `code = "TRANSPORT_ERROR"`, `retryable = boolean` (configurable by caller)
  - `RateLimitedError`: `code = "RATE_LIMITED"`, `retryable = true`
  - `TimeoutError`: `code = "TIMEOUT"`, `retryable = true`
  - `NotFoundError`: `code = "NOT_FOUND"`, `retryable = false`
  - `ParseError`: `code = "PARSE_ERROR"`, `retryable = false`

**Error Construction:**
- All error constructors accept optional `options` object with `cause` and `metadata`:
  ```typescript
  new ConfigurationError("userAgent is required and must be non-empty")
  new TransportError("503 Service Unavailable", true, {
    cause: originalError,
    metadata: { statusCode: 503, url: "https://..." }
  })
  ```
- Errors preserve the cause chain using `super(message, { cause: options?.cause })`
- Metadata is arbitrary `Record<string, unknown>` for debugging/observability

**Example from tests (`tests/errors.test.ts`):**
```typescript
it("preserves cause chain", () => {
  const cause = new Error("original")
  const err = new TransportError("wrapped", true, { cause })
  expect(err.cause).toBe(cause)
})
```

## Logging

**Framework:** `console` (no dedicated logging library)

**Patterns:**
- Console logging not yet implemented in main codebase
- Telemetry hooks (`onRequestStart`, `onRequestEnd`, `onRetry`) in `TelemetryOptions` are the primary instrumentation mechanism
- Callers can provide telemetry callbacks to `EdgarClient` constructor for observability (see `src/types/index.ts` lines 25-28)

## Comments

**When to Comment:**
- JSDoc comments for all public exports: types, classes, functions
- Inline comments for non-obvious logic or workarounds
- TODO comments with work item references: `// TODO: W-014, W-015` (references to `docs/edgar-ts-work-breakdown.md`)

**JSDoc/TSDoc:**
- Used extensively in `src/types/index.ts` for all public type definitions
- Format: Descriptive comment above type property
- Example from `src/types/index.ts`:
  ```typescript
  export type EdgarClientOptions = {
    /** Descriptive user-agent string (required by SEC). e.g. "AcmeLegalBot/1.0 (ops@acme.test)" */
    userAgent: string
    /** Max requests per second to SEC EDGAR. Default: 8 */
    maxRequestsPerSecond?: number
  }
  ```
- All public error classes in `src/errors/index.ts` have implicit purpose via class name; constructors documented via implementation pattern

## Function Design

**Size:**
- Functions kept concise; constructor bodies typically under 20 lines
- Stub methods (not yet implemented) throw `Error("Not yet implemented")` with TODO references

**Parameters:**
- Prefix time parameters with unit: `timeoutMs`, `baseDelayMs`, `maxDelayMs`
- Use option objects (destructured types) for multiple parameters rather than positional args
- Example: `EdgarClient` constructor accepts single `EdgarClientOptions` object, not separate args

**Return Values:**
- Async methods return `Promise<T>` where `T` is a public type
- Method stubs throw `Error` (not returning `null` or `undefined`)
- No implicit returns of `undefined`

**Example from `src/client.ts`:**
```typescript
async discoverFilings(_input: DiscoverFilingsInput): Promise<FilingRef[]> {
  // TODO: W-014, W-015
  throw new Error("Not yet implemented")
}
```

## Module Design

**Exports:**
- Use named exports for all public items; default exports avoided
- Barrel exports via `index.ts` files that re-export module contents
- Example from `src/index.ts`:
  ```typescript
  export { EdgarClient } from "./client"
  export * from "./types"
  export * from "./errors"
  ```

**Barrel Files:**
- Every module directory has an `index.ts` that exports all public items from that directory
- Empty barrel files for scaffold modules (e.g., `src/http/index.ts` is currently a TODO comment)
- Used to enforce clear module boundaries and control public API surface

**Internal Modules:**
- Modules like `http/`, `discovery/`, `exhibits/`, `download/`, `telemetry/` are internal (not re-exported from main barrel)
- Only top-level barrel (`src/index.ts`) exports `EdgarClient` and public types/errors

---

*Convention analysis: 2026-02-15*
