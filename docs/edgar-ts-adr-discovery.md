# ADR-002: Discovery Strategy

**Date:** 2026-02-15  
**Status:** Accepted

## Context
EDGAR data access surfaces vary in shape and latency. v1 needs deterministic filing discovery with bounded scope.

## Decision
1. Implement discovery behind a service abstraction that can combine multiple SEC retrieval strategies.
2. Default to locked core forms only.
3. Normalize and dedupe filings before returning from public API.
4. Preserve provenance URL and canonical identity fields in all outputs.

## Rationale
1. Adapter architecture reduces coupling to any one upstream response shape.
2. Form constraints keep v1 focused on contract-bearing filings.
3. Canonical normalization prevents downstream duplicate and ordering issues.

## Consequences
1. Additional adapter complexity compared to single-endpoint shortcuts.
2. Stronger reliability and future extensibility.
3. Deterministic behavior guaranteed by normalization and sorting stage.

## Rejected Alternatives
1. Single-endpoint hard dependency: rejected due to brittleness.
2. All-form discovery in v1: rejected due to noise and cost.
3. Returning raw upstream payloads: rejected due to poor contract stability.
