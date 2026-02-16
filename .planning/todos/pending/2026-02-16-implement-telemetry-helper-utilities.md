---
created: 2026-02-16T14:23:25.562Z
title: Implement telemetry helper utilities
area: telemetry
files:
  - src/telemetry/index.ts:1-3
  - src/http/client.ts:74,108,139,180,216
  - src/types/index.ts:25-52
---

## Problem

The telemetry module (`src/telemetry/index.ts`) is currently a stub with only a comment and TODO: W-023.

**Current state:**
- ✅ Telemetry **infrastructure is fully wired up** in `SecHttpClient` (hooks called at lines 139, 180, 216)
- ✅ Telemetry **types are fully defined** in `src/types/index.ts` (`TelemetryOptions`, `RequestStartEvent`, `RequestEndEvent`, `RetryEvent`)
- ✅ `EdgarClient` passes telemetry through to `SecHttpClient` (line 42 of client.ts)
- ❌ The `src/telemetry/` module **exports nothing** - users must implement hooks from scratch

While the telemetry system is fully functional (users can pass custom hooks), there are no convenience helpers for common use cases like logging, metrics aggregation, or testing.

## Solution

Implement optional telemetry helper utilities in `src/telemetry/`:

1. **Console logger** - Simple console.log implementation of telemetry hooks
2. **Structured logger** - JSON-formatted logger for production observability
3. **Metrics aggregator** - Track request counts, retry rates, latency percentiles
4. **Noop implementation** - Silent hooks for testing without console noise

These are convenience exports, not core requirements. The telemetry system already works - this just makes it easier for users to adopt common patterns.

**References:**
- TODO: W-023 in `src/telemetry/index.ts`
- Telemetry types: `src/types/index.ts:25-52`
- Hook call sites: `src/http/client.ts:139,180,216`
