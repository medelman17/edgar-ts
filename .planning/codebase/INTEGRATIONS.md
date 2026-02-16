# External Integrations

**Analysis Date:** 2026-02-15

## APIs & External Services

**SEC EDGAR:**
- Service: U.S. Securities and Exchange Commission EDGAR (Electronic Data Gathering, Online Real-time)
- What it's used for: Filing discovery, exhibit enumeration, exhibit download
- SDK/Client: None (uses native `fetch` API)
- URL Pattern: `https://www.sec.gov/cgi-bin/` (discovery endpoints) and `https://www.sec.gov/Archives/` (document retrieval)
- Auth: None (public API) - requires user-agent header per SEC terms of service
- Rate Limit: Default 8 requests/second (configurable via `maxRequestsPerSecond`)
- Retry Policy: 3 attempts by default with exponential backoff (250ms base, 4s max)

## Data Storage

**Databases:**
- None - Library is stateless, no persistence layer

**File Storage:**
- SEC EDGAR - External (read-only): SEC-hosted filing documents and exhibits
- Local filesystem - Optional: Consumer application responsible for persistence of downloaded exhibits

**Caching:**
- None - Library does not cache responses; consumer application handles caching strategy

## Authentication & Identity

**Auth Provider:**
- None (public API) - SEC EDGAR does not require authentication

**User-Agent Requirement:**
- SEC requires descriptive user-agent header per compliance guidelines
- Format: "Bot Name/Version (contact@example.com)"
- Implementation: Mandatory `userAgent` parameter in `EdgarClientOptions` (enforced at `src/client.ts` constructor)
- Applied to all HTTP requests via `SecHttpClient`

## Monitoring & Observability

**Error Tracking:**
- None built-in - Consumer application responsible for error logging

**Telemetry Hooks:**
- Optional telemetry callbacks in `EdgarClientOptions` at `src/types/index.ts`:
  - `onRequestStart(RequestStartEvent)` - Called before each HTTP request
  - `onRequestEnd(RequestEndEvent)` - Called after each HTTP response with status code and duration
  - `onRetry(RetryEvent)` - Called on automatic retry with attempt number, delay, and error details
- Telemetry events include: URL, HTTP method, status code, duration, timestamp, error messages
- Consumer can pipe to observability platform (Datadog, New Relic, Sentry, etc.)

**Logs:**
- None built-in - Consumer application responsible for logging via telemetry hooks

## CI/CD & Deployment

**Hosting:**
- npm public registry - Published as `edgar-ts` package
- GitHub repository: `github.com/medelman17/edgar-ts`

**CI Pipeline:**
- GitHub Actions - Lint, typecheck, test (Node 18/20/22 + Bun), build, size check
- Codecov integration via `codecov.yml` for coverage reporting

**Release Process:**
- Changesets-based semantic versioning
- npm publish with provenance attestation
- Automatic changelog generation via `@changesets/changelog-github`

## Environment Configuration

**Required env vars:**
- None - All configuration passed to `EdgarClient` constructor

**Constructor Configuration:**
- `userAgent` (string, required) - User-agent header for SEC compliance
- `maxRequestsPerSecond` (number, default: 8) - Rate limit cap
- `timeoutMs` (number, default: 10000) - Per-request timeout in milliseconds
- `retries` (object, optional):
  - `maxAttempts` (number, default: 3)
  - `baseDelayMs` (number, default: 250)
  - `maxDelayMs` (number, default: 4000)
- `telemetry` (object, optional) - Observability callbacks

**Secrets location:**
- None - No secrets used (public API)
- `.env` not required

## Webhooks & Callbacks

**Incoming:**
- None - Library is client-only, does not expose server endpoints

**Outgoing:**
- None - Library does not initiate callbacks to external services
- Telemetry callbacks are internal observability hooks (not network calls)

## HTTP Client Behavior

**Transport Layer:**
- Native `fetch` API (Node.js 18+ / Bun)
- AbortSignal for timeout enforcement (configurable `timeoutMs`)
- Standard HTTP headers: `User-Agent` (mandatory), `Accept`, `Content-Type`

**Request Retry Logic:**
- Automatic retry on transient errors (timeout, rate limit, 5xx)
- Non-retryable on validation, configuration, 404, parse errors
- Exponential backoff with jitter: delay = baseDelayMs × 2^(attempt - 1), capped at maxDelayMs
- Retryable errors tracked in error metadata: `TransportError`, `RateLimitedError`, `TimeoutError`

**Rate Limiting:**
- Token bucket algorithm (internally managed by `SecHttpClient`)
- Default: 8 requests/second
- Configurable per client instance
- Honors SEC Retry-After headers if present

**Error Categories:**
- `ConfigurationError` - Invalid client setup (not retryable)
- `ValidationError` - Invalid input parameters (not retryable)
- `TransportError` - Network/HTTP errors (retryable if transient)
- `RateLimitedError` - HTTP 429 Too Many Requests (retryable)
- `TimeoutError` - Request exceeded timeout (retryable)
- `NotFoundError` - HTTP 404 (not retryable)
- `ParseError` - Response parse failure (not retryable)

---

*Integration audit: 2026-02-15*
