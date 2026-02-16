# edgar-ts Product Requirements Document (PRD)

**Date:** 2026-02-15  
**Status:** Approved for implementation  
**Target:** New standalone TypeScript library (`edgar-ts`) with docs drafted in this repository first

## Problem Statement
Legal-tech and compliance teams need reliable, automatable access to contract exhibits in SEC EDGAR filings. Existing approaches are fragmented across Python-only tools, ad hoc scripts, and paid APIs with vendor lock-in. Teams using TypeScript stacks currently lack a focused, production-grade EDGAR library for discovery and raw exhibit retrieval.

The specific gap is a minimal, dependable library that can discover target filings, enumerate exhibits, isolate contract exhibits (`EX-10*`), and download raw bytes with SEC-compliant request behavior.

## Solution
Build `edgar-ts`, a high-level TypeScript library (Node + Bun) that provides:
1. Filing discovery over a bounded form set.
2. Exhibit enumeration per filing.
3. Contract exhibit filtering (`EX-10*`).
4. Raw exhibit download with metadata and integrity hash.
5. Built-in SEC-compliant user-agent and rate-limited HTTP behavior.

The library is intentionally storage-agnostic and parser-agnostic. It returns normalized data that downstream systems can store in MinIO/DB and parse in later phases.

## Goals
1. Deliver a stable high-level client API with low adoption friction.
2. Ensure deterministic output normalization and dedupe identity.
3. Enforce safe default SEC access behavior.
4. Support Node and Bun from first release.
5. Keep scope tight enough for rapid, low-risk v1 delivery.

## Non-Goals
1. Parsing contract content into clauses or semantic fields.
2. XBRL or financial statement analysis.
3. Browser runtime support.
4. Full feature parity with existing Python ecosystems.
5. Multi-registry support beyond SEC EDGAR.

## Target Users and Audience
1. Internal legal-tech platform engineers building ingestion pipelines.
2. Data engineering teams collecting SEC contract corpora.
3. Tooling teams migrating from Python-heavy ETL to TS runtimes.
4. Compliance automation teams requiring auditable acquisition logic.

## Locked Decisions
1. API scope: `discoverFilings`, `listExhibits`, `listContractExhibits`, `downloadExhibit`.
2. Filing scope: `8-K`, `10-K`, `10-Q`, `20-F`, `S-1` family including amendments.
3. Exhibit scope: `EX-10*` only.
4. Runtime scope: Node + Bun.
5. API style: high-level client first.
6. License: MIT.
7. Packaging target: standalone `edgar-ts` repo.

## Functional Requirements
- `FR-001`: The library SHALL expose a client constructor requiring a descriptive `userAgent` option.
- `FR-002`: The client SHALL expose `discoverFilings(input)` for date-bounded filing discovery.
- `FR-003`: `discoverFilings` SHALL support optional CIK-scoped discovery.
- `FR-004`: `discoverFilings` SHALL default to the locked core form set when `formTypes` is omitted.
- `FR-005`: The client SHALL expose `listExhibits(filing)` to return normalized exhibit metadata.
- `FR-006`: The client SHALL expose `listContractExhibits(filing)` and include only `EX-10*` exhibits.
- `FR-007`: The client SHALL expose `downloadExhibit(exhibit)` returning raw bytes and metadata.
- `FR-008`: `downloadExhibit` SHALL compute and return a SHA-256 digest for integrity.
- `FR-009`: The library SHALL normalize accession and exhibit identity fields consistently.
- `FR-010`: The library SHALL provide deterministic stable ordering of returned filing and exhibit lists.
- `FR-011`: The library SHALL include a configurable global request-rate cap.
- `FR-012`: The library SHALL enforce retry behavior for retryable failures.
- `FR-013`: The library SHALL classify errors into typed categories with retryability hints.
- `FR-014`: The library SHALL expose timeout controls.
- `FR-015`: The library SHALL support cancellation/abort semantics for long requests.
- `FR-016`: The library SHALL preserve source provenance URLs in normalized results.
- `FR-017`: The library SHALL provide explicit defaults for retries, timeouts, and rate limits.
- `FR-018`: The library SHALL avoid persistence side effects (no built-in DB/object-store writes).
- `FR-019`: The library SHALL expose TypeScript types for all public inputs and outputs.
- `FR-020`: The library SHALL return enough metadata for downstream idempotent storage.

## Non-Functional Requirements
- `NFR-001`: Public API behavior SHALL be consistent across Node and Bun.
- `NFR-002`: Default configuration SHALL remain within SEC fair-access rate guidelines.
- `NFR-003`: The library SHALL be deterministic for equivalent upstream responses.
- `NFR-004`: The library SHALL provide machine-readable error shapes suitable for orchestration.
- `NFR-005`: Core operations SHALL be observable via structured logs and telemetry hooks.
- `NFR-006`: Documentation SHALL be sufficient for a separate agent to implement without new architecture decisions.
- `NFR-007`: v1 SHALL keep dependency count intentionally low and avoid heavyweight framework lock-in.
- `NFR-008`: Release artifacts SHALL be semver-managed and include changelog entries.
- `NFR-009`: Unit and integration tests SHALL gate release with explicit pass thresholds.
- `NFR-010`: Security posture SHALL avoid embedding secrets and SHALL not require privileged runtime operations.

## User Stories
1. As a platform engineer, I want to discover SEC filings by date range so that I can run bounded ingestion jobs.
2. As a platform engineer, I want to optionally scope discovery by CIK so that I can target specific issuers.
3. As a platform engineer, I want default form filtering so that common contract-bearing filings are included by default.
4. As a platform engineer, I want explicit form overrides so that I can narrow or broaden collection windows.
5. As a pipeline owner, I want normalized accession numbers so that dedupe logic is deterministic.
6. As a pipeline owner, I want canonical filing URLs so that provenance is auditable.
7. As a pipeline owner, I want stable ordering of discovered filings so that replay jobs are reproducible.
8. As a data engineer, I want exhibit enumeration per filing so that I can decide what to store.
9. As a data engineer, I want exhibit sequence preserved so that I can map source positions.
10. As a data engineer, I want exhibit type and description fields so that downstream heuristics are possible.
11. As a legal-tech engineer, I want a contract-specific helper so that I do not duplicate `EX-10` filtering code.
12. As a legal-tech engineer, I want filtering to include dotted variants like `EX-10.1` so that real-world naming is covered.
13. As a legal-tech engineer, I want excluded non-contract exhibits to be clearly excluded so that noise is reduced.
14. As a workflow engineer, I want raw exhibit bytes returned so that I can store objects directly.
15. As a workflow engineer, I want file size metadata so that storage planning is accurate.
16. As a workflow engineer, I want MIME hints so that parser routing is easier later.
17. As a workflow engineer, I want SHA-256 hashes so that object integrity is verifiable.
18. As a reliability engineer, I want retryable errors labeled so that orchestrators can retry safely.
19. As a reliability engineer, I want non-retryable errors labeled so that dead-letter handling is correct.
20. As a reliability engineer, I want timeout controls so that hung requests do not block workers.
21. As a reliability engineer, I want abort support so that cancelled jobs release resources quickly.
22. As a security engineer, I want mandatory user-agent metadata so that SEC requests remain compliant.
23. As a security engineer, I want a configurable request cap so that usage remains within policy.
24. As an ops engineer, I want telemetry hooks so that I can monitor request rates and failures.
25. As an ops engineer, I want structured logs so that incident triage is faster.
26. As a team lead, I want API docs with examples so that onboarding is quick.
27. As a team lead, I want strict typing so that misuse is caught at compile time.
28. As a maintainer, I want minimal scope in v1 so that releases are predictable.
29. As a maintainer, I want semver rules so consumers can upgrade safely.
30. As a maintainer, I want changelog discipline so regressions are easier to spot.
31. As a maintainer, I want Node and Bun CI so runtime divergence is caught early.
32. As a maintainer, I want fixture-based tests so upstream volatility does not break local development.
33. As a maintainer, I want optional live-smoke tests so we can validate against real EDGAR behavior when needed.
34. As a product owner, I want explicit non-goals so scope creep is controlled.
35. As a product owner, I want acceptance criteria tied to tests so readiness is objective.
36. As an implementing agent, I want phase gates so work can be executed safely and incrementally.
37. As an implementing agent, I want a traceability matrix so I can prove requirement coverage.
38. As an implementing agent, I want defined defaults so I do not need to infer expected behavior.
39. As a downstream app team, I want storage-agnostic outputs so I can plug into MinIO/S3/DB stacks.
40. As a downstream app team, I want deterministic identities so duplicate suppression is straightforward.
41. As a downstream app team, I want pure functions where possible so unit testing is easy.
42. As a downstream app team, I want high-level APIs so I can integrate quickly without endpoint-level expertise.
43. As a compliance stakeholder, I want provenance preserved so every artifact can be traced to source.
44. As a compliance stakeholder, I want request-behavior guardrails documented so audits are defensible.
45. As a release manager, I want release checklists so publishing is consistent and low risk.
46. As a support engineer, I want categorized failure documentation so customer issues can be resolved quickly.

## Constraints
1. SEC access behavior must remain within fair-access boundaries.
2. Library implementation must not rely on GPL/AGPL-derived code.
3. v1 delivery must favor clarity and reliability over breadth.
4. Documentation in this repo must be portable to a new repository without rewrite.

## Risks and Mitigations
1. Upstream endpoint variability may break assumptions.
Mitigation: fixture coverage for known shapes, defensive parsing, typed errors for unknown formats.
2. Overly aggressive retries can violate access expectations.
Mitigation: bounded retries, jittered backoff, capped request rate.
3. Runtime differences between Node and Bun can cause subtle defects.
Mitigation: matrix CI, shared contract tests, avoid runtime-specific APIs where possible.
4. Scope creep toward parsing/analysis can derail release.
Mitigation: explicit non-goals and strict acceptance gates.

## Success Metrics
1. `SM-001`: `discoverFilings` success rate >= 99% on fixture-backed integration suite.
2. `SM-002`: `listContractExhibits` precision = 100% for fixture set of known `EX-10*` cases.
3. `SM-003`: `downloadExhibit` integrity hash correctness = 100% in deterministic test corpus.
4. `SM-004`: Request cap enforcement tests pass 100% with no over-cap events in simulation.
5. `SM-005`: Node and Bun test matrices both green on release branches.
6. `SM-006`: All `FR-*` and `NFR-*` mapped to at least one test and one implementation task.

## Polishing Requirements
1. Ensure API docs include one copy-paste example for each public method.
2. Ensure error messages are concise, actionable, and non-ambiguous.
3. Ensure naming consistency across types, methods, and docs.
4. Ensure generated artifacts and docs are free of unresolved TODOs.
5. Ensure changelog and migration notes are complete for first stable release.

## Implementation Decisions
1. Use a high-level `EdgarClient` as the public interface.
2. Separate concerns into deep modules: HTTP transport, discovery, exhibit extraction, download, normalization, errors.
3. Keep persistence outside library boundaries.
4. Default to safe request cap and bounded retries.
5. Normalize identities at module boundaries to reduce downstream ambiguity.
6. Prefer deterministic transforms over heuristic randomness.

## Testing Decisions
1. Tests verify public behavior via client methods, not private internals.
2. Unit tests cover normalization, filters, identity, and retry policy behavior.
3. Integration tests cover full method flows against fixture responses.
4. Optional live-smoke tests validate upstream compatibility when explicitly enabled.
5. Runtime parity tests run under both Node and Bun.

## Out of Scope
1. Document parsing, OCR, or text extraction.
2. Clause/entity extraction.
3. Multi-source ingestion beyond EDGAR.
4. UI and CLI tooling as product deliverables.
5. Backfill orchestration policy for specific downstream systems.

## Further Notes
1. This PRD is intentionally implementation-facing for handoff to an autonomous coding agent.
2. Cross-reference requirements to tests and tasks in the traceability matrix.
3. Any future expansion beyond `EX-10*` should be introduced as additive, opt-in features.
