// HTTP status code to typed error classification
// Maps SEC EDGAR responses to retryable/non-retryable errors

import {
  NotFoundError,
  RateLimitedError,
  TimeoutError,
  TransportError,
} from "@/errors"
import type { EdgarError } from "@/errors"

/**
 * Classify HTTP response error by status code
 *
 * Maps HTTP status codes to typed errors with correct retryability flags.
 * This function should only be called for non-2xx responses.
 *
 * Retryability rules:
 * - 5xx server errors: retryable (transient failures)
 * - 429 rate limited: retryable (external throttling)
 * - 408 request timeout: retryable (server timeout, not client)
 * - 404 not found: non-retryable (permanent condition)
 * - Other 4xx client errors: non-retryable (malformed request)
 *
 * @param statusCode - HTTP response status code
 * @param url - Request URL for error metadata
 * @returns Typed EdgarError with appropriate retryability flag
 *
 * @example
 * classifyResponseError(503, url) // → TransportError(retryable=true)
 * classifyResponseError(404, url) // → NotFoundError(retryable=false)
 * classifyResponseError(429, url) // → RateLimitedError(retryable=true)
 */
export function classifyResponseError(statusCode: number, url: string): EdgarError {
  const metadata = { statusCode, url }

  // 5xx Server Errors: retryable (transient failures)
  if (statusCode >= 500 && statusCode <= 599) {
    return new TransportError(`HTTP ${statusCode} from ${url}`, true, { metadata })
  }

  // 429 Too Many Requests: always retryable (external rate limiting)
  if (statusCode === 429) {
    return new RateLimitedError(`HTTP 429 Too Many Requests from ${url}`, { metadata })
  }

  // 408 Request Timeout: retryable (server timeout, not client-side timeout)
  if (statusCode === 408) {
    return new TimeoutError(`HTTP 408 Request Timeout from ${url}`, { metadata })
  }

  // 404 Not Found: non-retryable (filing/exhibit does not exist)
  if (statusCode === 404) {
    return new NotFoundError(`HTTP 404 Not Found: ${url}`, { metadata })
  }

  // Other 4xx Client Errors: non-retryable (malformed request, auth, etc.)
  if (statusCode >= 400 && statusCode <= 499) {
    return new TransportError(`HTTP ${statusCode} from ${url}`, false, { metadata })
  }

  // All other status codes: non-retryable (unexpected status)
  return new TransportError(`Unexpected HTTP ${statusCode} from ${url}`, false, {
    metadata,
  })
}
