// SecHttpClient — orchestrates rate limiting, timeout, retry, error classification, and telemetry

import { ConfigurationError, TimeoutError, TransportError } from "@/errors"
import type { EdgarError } from "@/errors"
import type { EdgarClientOptions } from "@/types"
import { TokenBucket } from "./limiter"
import { combineSignals } from "./timeout"
import { calculateBackoffMs } from "./retry"
import { classifyResponseError } from "./error-mapper"

// Web-standard APIs available globally in Node 18+ and Bun
declare const setTimeout: (callback: () => void, ms: number) => unknown
declare const fetch: (url: string, init?: { signal?: AbortSignal; headers?: Headers }) => Promise<HttpResponse>
declare class Headers {
  constructor(init?: Record<string, string>)
  has(name: string): boolean
  set(name: string, value: string): void
  get(name: string): string | null
}
declare class AbortSignal {
  static timeout(ms: number): AbortSignal
  readonly aborted: boolean
  readonly reason: unknown
  addEventListener(event: string, listener: () => void): void
}

// Internal types for fetch API (compatible with Node 18+ and Bun)
type HttpResponse = {
  readonly ok: boolean
  readonly status: number
}

type HttpRequestInit = {
  method?: string
  headers?: Record<string, string> | Headers
  body?: unknown
  signal?: AbortSignal
}

const DEFAULT_MAX_REQUESTS_PER_SECOND = 8
const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = {
  maxAttempts: 3,
  baseDelayMs: 250,
  maxDelayMs: 4_000,
}

/**
 * SEC HTTP client with rate limiting, timeout, retry, and telemetry.
 *
 * Orchestrates all five transport concerns:
 * 1. Rate limiting: TokenBucket enforces SEC compliance (default 8 req/s)
 * 2. Timeout: AbortSignal-based timeout with user signal composition
 * 3. Retry: Exponential backoff with full jitter on retryable errors
 * 4. Error classification: HTTP status → typed error with retryability flags
 * 5. Telemetry: Optional hooks for observability
 *
 * All requests flow through the request() method in this sequence:
 * - Validate user-agent header
 * - Retry loop (up to maxAttempts):
 *   - Acquire rate limiter token
 *   - Fire onRequestStart telemetry
 *   - Fetch with timeout
 *   - Fire onRequestEnd telemetry
 *   - Check response.ok
 *   - If error and retryable: backoff + retry
 *   - If error and non-retryable: throw immediately
 */
export class SecHttpClient {
  private readonly limiter: TokenBucket
  private readonly userAgent: string
  private readonly timeoutMs: number
  private readonly retries: Required<NonNullable<EdgarClientOptions["retries"]>>
  private readonly telemetry?: EdgarClientOptions["telemetry"]

  constructor(options: EdgarClientOptions) {
    // Validate user-agent (SEC compliance requirement)
    if (!options.userAgent || options.userAgent.trim().length === 0) {
      throw new ConfigurationError("userAgent is required and must be non-empty")
    }

    this.userAgent = options.userAgent.trim()

    // Initialize rate limiter
    const maxRequestsPerSecond = options.maxRequestsPerSecond ?? DEFAULT_MAX_REQUESTS_PER_SECOND
    if (maxRequestsPerSecond < 1 || maxRequestsPerSecond > 10) {
      throw new ConfigurationError(
        `maxRequestsPerSecond must be 1-10, got ${maxRequestsPerSecond}`,
      )
    }
    this.limiter = new TokenBucket(maxRequestsPerSecond)

    // Store timeout configuration
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    if (this.timeoutMs <= 0) {
      throw new ConfigurationError(`timeoutMs must be > 0, got ${this.timeoutMs}`)
    }

    // Store retry configuration
    this.retries = { ...DEFAULT_RETRIES, ...options.retries }
    if (this.retries.maxAttempts < 1) {
      throw new ConfigurationError(
        `retries.maxAttempts must be >= 1, got ${this.retries.maxAttempts}`,
      )
    }

    // Store optional telemetry hooks
    this.telemetry = options.telemetry
  }

  /**
   * Execute HTTP request with rate limiting, timeout, retry, and telemetry.
   *
   * @param url - URL to fetch
   * @param init - Fetch options (headers, method, signal, etc.)
   * @returns Promise resolving to Response (caller handles response.ok check and body parsing)
   * @throws EdgarError on retryable errors after exhausting retries, or non-retryable errors immediately
   */
  async request(url: string, init?: HttpRequestInit): Promise<HttpResponse> {
    // Ensure User-Agent header is set (SEC compliance)
    const headers = new Headers(
      init?.headers instanceof Headers ? {} : (init?.headers as Record<string, string>),
    )
    if (!headers.has("User-Agent")) {
      headers.set("User-Agent", this.userAgent)
    }

    const method = init?.method ?? "GET"
    const userSignal = init?.signal

    // Retry loop
    let attempt = 0
    while (attempt < this.retries.maxAttempts) {
      try {
        // 1. Acquire rate limiter token
        await this.limiter.acquire(1)

        // 2. Fire telemetry: onRequestStart
        this.telemetry?.onRequestStart?.({
          url,
          method,
          timestamp: Date.now(),
        })

        // 3. Fetch with timeout and abort composition
        const startTime = Date.now()

        // Create internal timeout signal
        const timeoutSignal = AbortSignal.timeout(this.timeoutMs)

        // Compose with user signal if provided
        const composedSignal = userSignal
          ? combineSignals([userSignal, timeoutSignal])
          : timeoutSignal

        let response: HttpResponse
        try {
          response = await fetch(url, { signal: composedSignal, headers })
        } catch (error) {
          // Differentiate timeout from user abort
          if (timeoutSignal.aborted && !userSignal?.aborted) {
            throw new TimeoutError(`Request timeout after ${this.timeoutMs}ms`, {
              metadata: { url, timeoutMs: this.timeoutMs, attempt: attempt + 1 },
            })
          }

          if (userSignal?.aborted) {
            throw new TransportError("Request cancelled by caller", false, {
              metadata: { url, cancelled: true },
            })
          }

          // Re-throw original error for other failures
          throw error
        }

        const durationMs = Date.now() - startTime

        // 4. Fire telemetry: onRequestEnd
        this.telemetry?.onRequestEnd?.({
          url,
          method,
          statusCode: response.status,
          durationMs,
          timestamp: Date.now(),
        })

        // 5. Check response.ok
        if (!response.ok) {
          const error = classifyResponseError(response.status, url)
          throw error
        }

        // Success: return response
        return response
      } catch (error) {
        // Classify error
        const typedError: EdgarError =
          error instanceof Error && "retryable" in error && typeof error.retryable === "boolean"
            ? (error as EdgarError)
            : new TransportError(
                error instanceof Error ? error.message : String(error),
                true,
                { cause: error },
              )

        // If non-retryable or last attempt: throw immediately
        if (!typedError.retryable || attempt === this.retries.maxAttempts - 1) {
          throw typedError
        }

        // Retryable error: calculate backoff and retry
        const delayMs = calculateBackoffMs(attempt, this.retries)

        // Fire telemetry: onRetry
        this.telemetry?.onRetry?.({
          url,
          attempt: attempt + 1,
          maxAttempts: this.retries.maxAttempts,
          delayMs,
          error: typedError.code,
          timestamp: Date.now(),
        })

        // Wait for backoff delay
        await new Promise<void>((resolve) => {
          setTimeout(resolve, delayMs)
        })

        // Increment attempt counter and retry
        attempt++
      }
    }

    // Should never reach here (loop always returns or throws)
    throw new TransportError("Exhausted retry attempts", false)
  }
}
