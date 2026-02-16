# edgar-ts Traceability Matrix

**Date:** 2026-02-15  
**Status:** Complete for documentation sprint

## Mapping Rules
1. Every requirement (`FR-*`, `NFR-*`) maps to at least one test scenario and one implementation task.
2. Scenario IDs reference the TDD document.
3. Task IDs reference the work breakdown document.

## Functional Requirement Mapping

| Requirement | Requirement Summary | Test Scenario IDs | Task IDs |
|---|---|---|---|
| FR-001 | constructor requires userAgent | constructor validation suite | W-004, W-005 |
| FR-002 | expose discoverFilings | DF-001..DF-006 | W-014, W-015 |
| FR-003 | CIK-scoped discovery | DF-004 | W-011, W-014, W-015 |
| FR-004 | default core forms | DF-001 | W-011, W-014, W-015 |
| FR-005 | expose listExhibits | LE-001..LE-003 | W-016, W-017 |
| FR-006 | expose listContractExhibits EX-10* | LC-001..LC-003 | W-018, W-019 |
| FR-007 | expose downloadExhibit | DE-001..DE-004 | W-020, W-022 |
| FR-008 | return SHA-256 hash | DE-001 hash assertions | W-021, W-022 |
| FR-009 | canonical identity normalization | DF-005, LE-003 | W-012, W-013, W-016 |
| FR-010 | deterministic ordering | DF-005, LE-001 | W-013, W-016 |
| FR-011 | configurable global request cap | XR-005 | W-007, W-010 |
| FR-012 | retries on retryable failures | XR-001 | W-006, W-009, W-010 |
| FR-013 | typed error categories | XR-002, XR-003, DE-004 | W-006, W-010 |
| FR-014 | timeout controls | XR-003 | W-008, W-010 |
| FR-015 | cancellation support | XR-004 | W-008, W-010 |
| FR-016 | preserve provenance URLs | DF-001, LE-001 | W-012, W-016 |
| FR-017 | explicit defaults | constructor/default tests | W-005 |
| FR-018 | no persistence side effects | integration behavior assertions | W-015, W-017, W-022 |
| FR-019 | exported TS types | type compile tests | W-004 |
| FR-020 | metadata for idempotent storage | DE-001, LE-001 | W-016, W-022 |

## Non-Functional Requirement Mapping

| Requirement | Requirement Summary | Test Scenario IDs | Task IDs |
|---|---|---|---|
| NFR-001 | Node/Bun parity | XR-006 | W-002, W-026 |
| NFR-002 | SEC-safe default rates | XR-005, compliance tests | W-007, W-010 |
| NFR-003 | deterministic outputs | DF-005, LE-001 | W-013, W-016 |
| NFR-004 | machine-readable errors | XR-002, XR-003 | W-006, W-010 |
| NFR-005 | structured observability | telemetry event tests | W-023 |
| NFR-006 | decision-complete docs | docs review checklist | W-027, W-028 |
| NFR-007 | low dependency footprint | dependency policy checks | W-001, W-028 |
| NFR-008 | semver + changelog governance | release checklist tests | W-028 |
| NFR-009 | explicit release test thresholds | CI gate checks | W-002, W-026 |
| NFR-010 | no privileged/secrets requirement | config validation tests | W-005, W-010 |

## API-to-Test-to-Task Summary

| Public API | Primary Test IDs | Primary Task IDs |
|---|---|---|
| discoverFilings | DF-001..DF-006 | W-011, W-012, W-013, W-014, W-015 |
| listExhibits | LE-001..LE-003 | W-016, W-017 |
| listContractExhibits | LC-001..LC-003 | W-018, W-019 |
| downloadExhibit | DE-001..DE-004 | W-020, W-021, W-022 |

## Coverage Audit Checklist
1. Confirm no requirement row has empty test mappings.
2. Confirm no requirement row has empty task mappings.
3. Confirm each task on critical path maps to at least one requirement.
4. Confirm TDD scenario IDs stay stable when tests are implemented.

## Sign-off Criteria
1. Matrix reviewed alongside PRD and TDD before coding starts.
2. Matrix updated if requirement IDs or task IDs change.
3. Matrix stored with release artifact docs for audit trail.
