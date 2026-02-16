# Testing Patterns

**Analysis Date:** 2026-02-15

## Test Framework

**Runner:**
- Vitest 4.0.0
- Config: `vitest.config.ts`
- Environment: Node

**Assertion Library:**
- Vitest built-in assertions (using `expect` from Vitest globals)
- Assertions used: `.toBeInstanceOf()`, `.toThrow()`, `.toBe()`, `.toEqual()`

**Run Commands:**
```bash
pnpm test              # Run tests in watch mode
pnpm test:run          # Run tests once (non-watch)
pnpm vitest run tests/client.test.ts      # Run single test file
pnpm vitest run -t "rejects empty"        # Run tests matching pattern
```

**Coverage:**
```bash
pnpm test:run          # Coverage included via v8 provider
```

Coverage config in `vitest.config.ts`:
- Provider: v8
- Reporters: text, json, html
- Coverage targets:
  - Lines: 80%
  - Functions: 80%
  - Branches: 75%
  - Statements: 80%
- Include: `src/**/*.ts`
- Exclude: `src/**/*.test.ts`, `src/types/**`
- Coverage report generated to `coverage/` directory (default Vitest output)

## Test File Organization

**Location:**
- Co-located in `tests/` directory (not alongside source files)
- Directory structure mirrors `src/` structure for organization (though currently flat)

**Naming:**
- Pattern: `[module].test.ts`
- Examples: `tests/client.test.ts`, `tests/errors.test.ts`

**Structure:**
```
tests/
├── client.test.ts       # EdgarClient tests
└── errors.test.ts       # Error taxonomy tests
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from "vitest"
import { EdgarClient, ConfigurationError } from "@/index"

describe("EdgarClient", () => {
  describe("constructor", () => {
    it("accepts valid options", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })
  })
})
```

**Patterns:**
- Top-level `describe()` block per class/module
- Nested `describe()` blocks for method/feature grouping
- Test cases use `it()` for each assertion scenario
- Setup: Direct inline test data (no shared fixtures yet)
- Teardown: Not used (tests are stateless)
- Assertion: Direct `expect()` chains

**Test Naming Convention:**
- Descriptive, complete sentences: `"accepts valid options"`, `"rejects empty userAgent"`
- Start with verb: `"accepts"`, `"rejects"`, `"preserves"`, `"carries"`
- Test names describe the behavior being tested, not the test mechanism

**Example from `tests/client.test.ts`:**
```typescript
describe("EdgarClient", () => {
  describe("constructor", () => {
    it("accepts valid options", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("rejects empty userAgent", () => {
      expect(() => new EdgarClient({ userAgent: "" })).toThrow(ConfigurationError)
    })

    it("rejects whitespace-only userAgent", () => {
      expect(() => new EdgarClient({ userAgent: "   " })).toThrow(ConfigurationError)
    })
  })
})
```

## Error Testing

**Patterns:**
- Constructor errors tested with `expect(() => new Class(...)).toThrow(ErrorType)`
- Error properties tested on instantiated error objects:
  ```typescript
  it("ConfigurationError is non-retryable", () => {
    const err = new ConfigurationError("bad config")
    expect(err).toBeInstanceOf(EdgarError)
    expect(err.code).toBe("CONFIGURATION_ERROR")
    expect(err.retryable).toBe(false)
    expect(err.name).toBe("ConfigurationError")
  })
  ```
- Cause chain preservation tested via `.cause` property:
  ```typescript
  it("preserves cause chain", () => {
    const cause = new Error("original")
    const err = new TransportError("wrapped", true, { cause })
    expect(err.cause).toBe(cause)
  })
  ```
- Metadata tested as object properties:
  ```typescript
  it("carries metadata", () => {
    const err = new TransportError("failed", false, {
      metadata: { statusCode: 500, url: "https://efts.sec.gov/..." },
    })
    expect(err.metadata?.statusCode).toBe(500)
  })
  ```

**Example from `tests/errors.test.ts`:**
```typescript
describe("Error taxonomy", () => {
  it("RateLimitedError is retryable", () => {
    const err = new RateLimitedError("429 Too Many Requests")
    expect(err.code).toBe("RATE_LIMITED")
    expect(err.retryable).toBe(true)
  })

  it("TransportError retryability is configurable", () => {
    const retryable = new TransportError("503", true)
    const nonRetryable = new TransportError("400", false)
    expect(retryable.retryable).toBe(true)
    expect(nonRetryable.retryable).toBe(false)
  })
})
```

## Mocking

**Framework:** Not currently used

**Strategy:** Currently tests use real objects and no mocking library
- Constructor tests verify `EdgarClient` accepts and stores configuration
- Error tests instantiate real error objects and verify their properties
- No HTTP calls or external dependencies to mock yet (methods not implemented)

**When to Mock (future):**
- HTTP client calls (will mock `SecHttpClient` in transport tests)
- External SEC EDGAR API responses
- Time-based operations (for retry delay testing)

## Fixtures and Factories

**Test Data:**
- Currently inline in test cases
- Example from `tests/client.test.ts`:
  ```typescript
  const client = new EdgarClient({
    userAgent: "TestBot/1.0 (test@example.com)",
  })
  ```

**Patterns for future:**
- Consider factory functions for complex test data as more tests are added
- Example pattern (future): `createTestClient(overrides?: Partial<EdgarClientOptions>)`

**Location:**
- Not yet needed; test data co-located in test files
- Future: May extract to `tests/fixtures/` or `tests/factories/` as test suite grows

## Test Types

**Unit Tests:**
- Scope: Individual classes and functions
- Approach: Direct instantiation and assertion of behavior
- Examples:
  - `EdgarClient` constructor configuration validation
  - Error class instantiation and property verification
  - Error retryability flags for different error types

**Integration Tests:**
- Not yet implemented
- Future: Will test HTTP client integration with SEC API, exhibit discovery pipeline, etc.

**E2E Tests:**
- Not used (library is low-level; E2E is caller's responsibility)

## Async Testing

**Not yet implemented** (stub methods don't have async behavior)

**Pattern (when needed):**
- Use `async`/`await` in test functions:
  ```typescript
  it("discovers filings", async () => {
    const result = await client.discoverFilings({ from: "2024-01-01", to: "2024-01-31" })
    expect(result).toEqual(expect.arrayContaining([...]))
  })
  ```
- Vitest handles async automatically via `testTimeout` (set to 10000ms in config)

## Coverage

**Requirements:**
- Lines: 80%
- Functions: 80%
- Branches: 75%
- Statements: 80%
- Configured in `vitest.config.ts` (lines 12-20)
- Currently excluded from coverage: `src/types/**` (type definitions) and `src/**/*.test.ts` (test files)

**View Coverage:**
```bash
pnpm test:run          # Generates coverage/index.html
# Open coverage/index.html in browser
```

**Current State:**
- Constructor and error tests provide baseline coverage
- Stub methods (not yet implemented) will be covered as implementation proceeds
- Type-only modules (`src/types/`) excluded from coverage requirement

## Test Naming Conventions

**Test Suites:** Describe the unit being tested
- `describe("EdgarClient", ...)` for the main client class
- `describe("Error taxonomy", ...)` for error class behavior
- Nested: `describe("constructor", ...)` for method-specific tests

**Test Cases:** Describe the specific behavior
- Action + Expected Result pattern: `"accepts valid options"`, `"rejects empty userAgent"`
- State + Assertion pattern: `"is non-retryable"`, `"is retryable"`, `"preserves cause chain"`
- Verb-first naming is consistent throughout

## Configuration

**vitest.config.ts:**
```typescript
import { defineConfig } from "vitest/config"
import { resolve } from "node:path"

export default defineConfig({
  resolve: {
    alias: { "@": resolve(__dirname, "./src") },
  },
  test: {
    globals: true,                           // describe, it, expect are globals
    environment: "node",                     // Node.js environment
    include: ["tests/**/*.test.ts"],          // Test file pattern
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/types/**"],
      lines: 80,
      functions: 80,
      branches: 75,
      statements: 80,
    },
    testTimeout: 10000,                     // 10 second timeout per test
  },
})
```

## Test Isolation

**Globals:** Vitest globals enabled (`globals: true`)
- `describe`, `it`, `expect` available without import
- However, tests explicitly import from Vitest for clarity: `import { describe, expect, it } from "vitest"`

**State:** Each test is independent (no shared state across tests)

---

*Testing analysis: 2026-02-15*
