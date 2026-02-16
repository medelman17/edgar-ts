# edgar-ts Versioning and Release Plan

**Date:** 2026-02-15  
**Status:** Approved

## Versioning Policy
1. Use semantic versioning.
2. Major release for breaking API or behavioral default changes.
3. Minor release for additive features and optional fields.
4. Patch release for bug fixes with no contract changes.

## Initial Milestones
1. `v0.1.0`: internal alpha with full API surface and test matrix.
2. `v0.2.0`: hardening release with docs and observability hooks.
3. `v1.0.0`: stable release after parity and compliance gates pass.

## Release Gates
1. Mandatory test suites pass in Node and Bun.
2. Traceability matrix complete.
3. No open critical defects.
4. Changelog and migration notes updated.
5. License and package metadata validated.

## Changelog Rules
1. Every user-visible change gets a changelog entry.
2. Include sections:
- Added
- Changed
- Fixed
- Deprecated
3. Link each entry to requirement or issue ID when possible.

## Release Checklist
1. Bump version according to semver policy.
2. Run full CI matrix.
3. Validate package build artifacts.
4. Verify README/API examples compile/run.
5. Publish package.
6. Tag release.
7. Publish release notes.

## Rollback Strategy
1. For bad release, deprecate affected version immediately.
2. Publish patch rollback version with explicit notes.
3. Notify consumers via release notes and issue tracker.

## Deprecation Policy
1. Deprecations introduced only in minor versions.
2. Keep deprecated surface for at least one minor cycle unless security/compliance requires immediate removal.
3. Provide migration guidance before removal.

## Runtime Compatibility Policy
1. Supported runtimes listed per release.
2. Any runtime support drop is a major version change.
3. Compatibility tested continuously in CI.

## Ownership
1. Release owner validates checklist completion.
2. Reviewer confirms semver impact classification.
3. Maintainer signs off on compliance-sensitive changes.
