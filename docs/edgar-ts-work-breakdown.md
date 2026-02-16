# edgar-ts Work Breakdown Structure

**Date:** 2026-02-15  
**Status:** Execution-ready

## Task List

| Task ID | Scope | Depends On | Required Tests | Deliverable | Exit Criteria |
|---|---|---|---|---|---|
| W-001 | Initialize new repo with package metadata and MIT license | none | bootstrap smoke | repo scaffold | package scripts run locally |
| W-002 | Configure Node+Bun CI matrix | W-001 | CI dry run | CI workflow | both runtime jobs execute |
| W-003 | Add lint/typecheck/test scripts | W-001 | script smoke | tooling config | all scripts callable |
| W-004 | Define public types (`options`, `FilingRef`, `ExhibitRef`, `DownloadedExhibit`) | W-001 | type compile | type module | contract types compile |
| W-005 | Implement `EdgarClient` skeleton and constructor validation | W-004 | constructor tests | client facade | invalid config rejected |
| W-006 | Implement error base class and typed subclasses | W-004 | error taxonomy tests | error module | retryability flags validated |
| W-007 | Build request limiter abstraction | W-003 | limiter unit tests | limiter module | cap behavior verified |
| W-008 | Build timeout/abort wrapper | W-003 | timeout tests | timeout module | abort propagation verified |
| W-009 | Implement retry policy engine | W-006, W-007, W-008 | retry matrix tests | retry module | bounded retries verified |
| W-010 | Implement SEC HTTP client with headers and telemetry hooks | W-005, W-007, W-008, W-009 | transport integration tests | http module | requests include required headers |
| W-011 | Add date and CIK validation helpers | W-004 | validation tests | validation module | invalid inputs rejected |
| W-012 | Implement filing normalization helpers | W-004 | normalization tests | normalization module | canonical fields verified |
| W-013 | Implement filing dedupe and ordering | W-012 | dedupe/order tests | dedupe utility | deterministic output proven |
| W-014 | Implement discovery service adapters with fixture transport | W-010, W-011, W-012, W-013 | discoverFilings tests | discovery module | DF suites pass |
| W-015 | Wire `discoverFilings` public API | W-005, W-014 | API behavior tests | client method | DF contract complete |
| W-016 | Implement exhibit parsing/normalization helpers | W-010, W-012 | exhibit normalization tests | exhibit utility | normalized exhibit outputs |
| W-017 | Implement `listExhibits` flow | W-005, W-016 | listExhibits tests | client method | LE suites pass |
| W-018 | Implement `EX-10*` matcher | W-016 | contract filter tests | filter module | match/reject cases pass |
| W-019 | Implement `listContractExhibits` flow | W-017, W-018 | listContractExhibits tests | client method | LC suites pass |
| W-020 | Implement download transport path and metadata mapping | W-010 | download flow tests | download module | bytes and metadata returned |
| W-021 | Implement SHA-256 hashing utility | W-020 | hash tests | integrity utility | deterministic digest verified |
| W-022 | Wire `downloadExhibit` public API | W-005, W-020, W-021 | download API tests | client method | DE suites pass |
| W-023 | Add structured telemetry event emitters | W-010, W-015, W-017, W-019, W-022 | telemetry tests | observability hooks | event coverage complete |
| W-024 | Build fixture corpus and snapshot baselines | W-014, W-017, W-019, W-022 | fixture integrity tests | fixtures | fixture docs complete |
| W-025 | Add optional live-smoke test harness | W-015, W-022 | live-smoke job | smoke suite | gated live checks run |
| W-026 | Validate Node/Bun parity for full suite | W-015, W-019, W-022, W-024 | runtime parity tests | parity report | both runtimes green |
| W-027 | Finalize API docs and usage examples | W-015, W-019, W-022 | example compile tests | docs | examples verified |
| W-028 | Prepare release metadata, changelog, and version tag rules | W-026, W-027 | release checklist | release config | release dry run passes |

## Parallelization Map
1. `W-006`, `W-007`, `W-008`, `W-011`, `W-012` can run in parallel after bootstrap.
2. `W-016` can begin once HTTP and normalization foundations are stable.
3. `W-023` can proceed in parallel with method wiring once event contracts are fixed.

## Critical Path
1. bootstrap (`W-001`..`W-005`)
2. HTTP reliability core (`W-006`..`W-010`)
3. discovery (`W-011`..`W-015`)
4. exhibits (`W-016`..`W-019`)
5. download (`W-020`..`W-022`)
6. parity + release (`W-026`..`W-028`)

## Risk Path Tasks
1. `W-010` (HTTP client correctness)
2. `W-014` (discovery shape variability)
3. `W-018` (contract-type matching correctness)
4. `W-026` (Node/Bun parity)

## Exit Condition for Full Implementation
All tasks complete with green mandatory tests, traceability matrix filled, and release checklist passing.
