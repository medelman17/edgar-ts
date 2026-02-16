# edgar-ts Test-Driven Development Plan

**Date:** 2026-02-15  
**Status:** Approved  
**Companion docs:** PRD, architecture, API contract, work breakdown, traceability matrix

## TDD Philosophy
1. Test behavior via public interfaces only.
2. Keep cycles vertical: one failing test, minimal code to pass, then refactor.
3. Avoid testing implementation details (private methods, internal modules directly) unless they are exported, stable contracts.
4. Prefer deterministic fixtures over live calls for core regression coverage.
5. Gate release on Node and Bun parity.

## Scope of Testing
1. `discoverFilings`
2. `listExhibits`
3. `listContractExhibits`
4. `downloadExhibit`
5. Shared cross-cutting behavior: retry, timeout, rate limiting, normalization, typed errors

## Test Layers
1. Unit tests: pure behavior and deterministic transforms.
2. Integration tests: public client methods with mocked transport + fixture responses.
3. Contract tests: verify response normalization stays stable across fixture versions.
4. Live-smoke tests: optional, low-volume checks against live SEC endpoints.

## Behavior Test Matrix

| API | Scenario ID | Behavior | Expected Outcome |
|---|---|---|---|
| discoverFilings | DF-001 | default form set applied when formTypes omitted | only core forms returned |
| discoverFilings | DF-002 | explicit form override | only requested forms returned |
| discoverFilings | DF-003 | date window boundaries | inclusive boundary behavior is deterministic |
| discoverFilings | DF-004 | CIK scoping | only target issuer filings returned |
| discoverFilings | DF-005 | duplicate source records | deduped stable filing set |
| discoverFilings | DF-006 | malformed optional fields | resilient normalization with typed warnings/errors |
| listExhibits | LE-001 | filing with multiple exhibit families | all exhibits normalized and ordered |
| listExhibits | LE-002 | missing description fields | null-safe output |
| listExhibits | LE-003 | sequence formatting variance | canonical sequence normalization |
| listContractExhibits | LC-001 | mixed exhibit types | only `EX-10*` included |
| listContractExhibits | LC-002 | `EX-10`, `EX-10.1`, `EX-10_2` style variants | matched per normalization rules |
| listContractExhibits | LC-003 | no contract exhibits present | empty list with no error |
| downloadExhibit | DE-001 | successful binary retrieval | bytes + size + hash returned |
| downloadExhibit | DE-002 | content-type missing | bytes still returned, mime optional |
| downloadExhibit | DE-003 | response length mismatch | typed integrity/error failure |
| downloadExhibit | DE-004 | 404/410 retrieval failure | non-retryable typed error |
| cross-cutting | XR-001 | retry on retryable 5xx | retry attempts bounded and succeed/fail deterministically |
| cross-cutting | XR-002 | no retry on non-retryable 4xx | immediate failure |
| cross-cutting | XR-003 | timeout behavior | typed timeout error |
| cross-cutting | XR-004 | abort signal propagation | request cancelled cleanly |
| cross-cutting | XR-005 | rate cap enforcement | no request burst above configured cap |
| cross-cutting | XR-006 | Node/Bun behavior parity | equivalent method results and error classes |

## Fixture Strategy
1. Maintain a versioned fixture corpus covering:
1. filing discovery responses
2. filing detail/exhibit listing responses
3. exhibit download responses
2. Include edge fixtures:
1. incomplete metadata
2. unexpected fields
3. missing optional fields
4. duplicate entries
5. sequence anomalies
3. Lock golden normalized outputs as snapshots for high-signal drift detection.
4. Keep fixture provenance metadata (source date, endpoint class, redaction notes).

## Integration Strategy
1. Use transport stubs to avoid live network dependency in core integration suites.
2. Validate entire API call path through `EdgarClient`, not internal helpers.
3. Assert both payload content and deterministic ordering.

## Live-Smoke Strategy (Optional)
1. Disabled by default.
2. Enabled via environment switch in CI/manual runs.
3. Executes low-volume checks on representative CIK/date windows.
4. Hard cap on request count and runtime to avoid policy and flake risks.

## Runtime Matrix
1. Node LTS test job.
2. Bun stable test job.
3. All critical suites required green in both jobs for release.

## Coverage and Quality Thresholds
1. Statement coverage minimum: 90% for core modules.
2. Branch coverage minimum: 85% for retry/rate-limit/error modules.
3. Mandatory pass suites:
1. public API behavior suite
2. rate-limit suite
3. retry/error suite
4. runtime parity suite

## 12 Ordered Vertical Slices (Red-Green-Refactor)
1. Slice 1: Client constructor validates required `userAgent`.
2. Slice 2: `discoverFilings` basic success with fixture transport.
3. Slice 3: `discoverFilings` default form filtering.
4. Slice 4: `discoverFilings` dedupe and stable ordering.
5. Slice 5: `listExhibits` normalization and ordering.
6. Slice 6: `listContractExhibits` `EX-10*` filtering logic.
7. Slice 7: `downloadExhibit` success path with bytes + hash.
8. Slice 8: retry policy behavior for retryable failures.
9. Slice 9: timeout and abort behavior.
10. Slice 10: typed error taxonomy mapping.
11. Slice 11: rate-limit cap enforcement under burst simulation.
12. Slice 12: Node/Bun parity suite and final refactor cleanup.

## Refactor Rules
1. Refactor only when all current tests are green.
2. Preserve public method signatures and documented defaults.
3. Re-run full matrix after each non-trivial refactor.

## Done Criteria for Implementing Agent
1. All mandatory suites pass under Node and Bun.
2. Traceability matrix links each `FR-*`/`NFR-*` to test IDs.
3. No unresolved flaky tests in required suites.
4. No skipped critical-path tests.
5. Public API examples validated by executable tests.

## Anti-Patterns to Avoid
1. Writing all tests first before implementing any slice.
2. Mocking internal module calls in public API tests.
3. Basing core correctness on live SEC responses only.
4. Adding features outside locked scope while writing tests.

## Exit Gate
Implementation can proceed to release-readiness only when this TDD plan is fully satisfied and all traceability mappings are complete.
