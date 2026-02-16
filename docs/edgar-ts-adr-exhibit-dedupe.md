# ADR-003: Exhibit Filtering and Dedupe Identity

**Date:** 2026-02-15  
**Status:** Accepted

## Context
Contract ingestion requires high precision and deterministic identity. EDGAR exhibit type formatting is not fully uniform across filings.

## Decision
1. v1 contract filter is `EX-10*` only.
2. Exhibit identity key is `accessionNo + sequence` after canonical normalization.
3. Exhibit type matching is normalization-aware for dotted/suffixed variants.
4. Stable output ordering is mandatory.

## Rationale
1. `EX-10*` is the highest-value minimal target for material contract collection.
2. Identity strategy maps to reliable filing-local exhibit uniqueness.
3. Deterministic ordering and keys simplify downstream idempotent storage.

## Consequences
1. `EX-4`/`EX-99` and other exhibit families are deferred.
2. Additional normalization logic is required in filter pipeline.
3. Downstream systems can use deterministic keys without extra heuristics.

## Rejected Alternatives
1. All-exhibit capture in v1: rejected due to noise and storage burden.
2. Filename-based identity: rejected due to instability.
3. Type-only identity: rejected due to collisions.
