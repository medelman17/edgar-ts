# edgar-ts Agent Implementation Playbook

**Date:** 2026-02-15  
**Audience:** Autonomous coding agent implementing `edgar-ts` in the new repository

## Mission
Implement `edgar-ts` exactly to locked scope:
1. `discoverFilings`
2. `listExhibits`
3. `listContractExhibits`
4. `downloadExhibit`

Do not implement parsing, storage, or non-`EX-10*` extraction in this sprint.

## Non-Negotiable Decisions
1. Runtime support: Node + Bun.
2. API style: high-level client first.
3. Exhibit scope: `EX-10*` only.
4. Filing scope: core forms only.
5. License: MIT.

## Execution Phases

## Phase 0: Repository Bootstrap
Exit criteria:
1. package scaffold and CI matrix for Node + Bun are live.
2. baseline lint/test tasks run.
3. docs copied from this handoff pack.

## Phase 1: Public Types and Client Skeleton
Exit criteria:
1. all public type contracts compile.
2. constructor validation behavior implemented and tested.
3. no network logic yet beyond stubs.

## Phase 2: HTTP Core
Exit criteria:
1. rate limiter active.
2. timeout/abort support active.
3. retry policy implemented with typed errors.
4. tests for retry + timeout + limiter pass.

## Phase 3: Discovery Flow
Exit criteria:
1. `discoverFilings` works against fixtures.
2. form defaults, date filtering, CIK normalization, dedupe, stable sorting tested.

## Phase 4: Exhibit Enumeration and Contract Filtering
Exit criteria:
1. `listExhibits` returns normalized deterministic outputs.
2. `listContractExhibits` filters to `EX-10*` only.
3. edge fixtures for exhibit-type variants pass.

## Phase 5: Download Flow
Exit criteria:
1. `downloadExhibit` returns bytes + metadata + SHA-256.
2. integrity and failure-path tests pass.

## Phase 6: Runtime Parity and Hardening
Exit criteria:
1. Node and Bun matrices green.
2. optional live-smoke checks documented and gated.
3. no unresolved flaky tests in required suites.

## Phase 7: Release Readiness
Exit criteria:
1. versioning/changelog policy applied.
2. docs examples validated.
3. traceability matrix complete and consistent.

## Required Validation at Each Phase
1. run relevant unit and integration suites.
2. update docs when behavior contracts change.
3. confirm no scope expansion occurred.

## Escalation Rules
Escalate to maintainer immediately if:
1. SEC response shapes conflict with locked normalization rules.
2. achieving Node+Bun parity requires API contract changes.
3. compliance defaults (rate cap, user-agent requirement) appear incompatible with live behavior.
4. a requirement cannot be implemented without adding out-of-scope functionality.

## Prohibited Implementation Moves
1. Adding persistence adapters into core library.
2. Introducing parser/OCR dependencies.
3. Expanding form or exhibit families beyond locked scope.
4. Changing public API signatures without ADR and semver impact assessment.

## Pull Request Strategy
1. PR-1: bootstrap + contracts + constructor validation.
2. PR-2: HTTP core + retry/timeout/rate-limit.
3. PR-3: discovery.
4. PR-4: exhibits + contract filter.
5. PR-5: download + integrity.
6. PR-6: runtime parity, docs, release prep.

## Definition of Done
1. All required tests pass in Node and Bun.
2. All `FR-*` and `NFR-*` mapped in traceability matrix.
3. Public examples execute successfully.
4. No unresolved high-severity TODOs.
5. Release candidate tagged with changelog entry.
