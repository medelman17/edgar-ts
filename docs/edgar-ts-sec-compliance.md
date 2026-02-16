# edgar-ts SEC Compliance and Rate-Limit Guardrails

**Date:** 2026-02-15  
**Status:** Approved  
**Purpose:** Operationalize SEC fair-access constraints in library behavior

## Compliance Principles
1. Identify client traffic with a descriptive user-agent and contact channel.
2. Maintain conservative outbound request rates.
3. Avoid bursty or abusive retry loops.
4. Preserve provenance and request-behavior observability for auditability.

## Required User-Agent Policy
1. `userAgent` is mandatory.
2. Expected format pattern:
`<application>/<version> (<contact-email-or-url>)`
3. Empty, placeholder, or anonymous values are rejected at client construction.

## Request-Rate Policy
1. Default cap: `8 req/s` global per client instance.
2. Maximum allowed config in v1: `10 req/s`.
3. Limiter applies across all methods and retries.

## Backoff and Retry Safety
1. Use bounded exponential backoff with jitter.
2. Hard attempt cap prevents uncontrolled retry storms.
3. Retry only typed retryable errors.

## Timeouts
1. Requests must timeout predictably to avoid hanging resources.
2. Caller may override timeout for controlled workflows.

## Resource Respect Rules
1. Do not parallelize outbound requests beyond configured limiter.
2. Do not auto-escalate request cap based on transient failures.
3. Preserve defensive parsing for variable EDGAR payloads.

## Compliance Telemetry (Required)
1. `request.start`
2. `request.end`
3. `request.retry`
4. `request.rate_limited`
5. `request.failed`

Each event includes:
1. method/operation
2. URL class
3. attempt index
4. status code (if applicable)
5. latency bucket

## Audit Evidence Expectations
Library consumers should be able to reconstruct:
1. what endpoint category was accessed,
2. when and how often requests were made,
3. whether retries/backoffs were applied,
4. why terminal failures occurred.

## Security and Legal Boundaries
1. This doc is operational guidance, not legal advice.
2. Consumers are responsible for validating policy changes over time.
3. Library defaults are conservative but configurable.

## Compliance Acceptance Criteria
1. Construction fails without valid user-agent.
2. Simulation proves effective cap never exceeds configured rate.
3. Retry behavior remains bounded and jittered.
4. Retry-on-429 path remains within cap.
5. Telemetry emits required event classes.

## Change Management
1. Any change to default cap, retry policy, or user-agent validation requires ADR update and major-version consideration if behaviorally breaking.
