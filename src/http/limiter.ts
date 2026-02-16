// Token bucket rate limiter for SEC EDGAR compliance

// setTimeout is available globally in Node 18+ and Bun
declare const setTimeout: (callback: () => void, ms: number) => unknown

/**
 * Token bucket rate limiter with configurable refill rate.
 * Enforces steady-state rate limiting with controlled burst on startup.
 *
 * Implementation follows SEC compliance requirements:
 * - Default: 8 requests/second
 * - Bounded: 1-10 requests/second
 * - Capacity equals refill rate (prevents burst abuse)
 * - Refill happens on every acquire() call (no background timer)
 * - Sequential processing via promise chain ensures fairness
 */
export class TokenBucket {
  private tokens: number
  private lastRefillTime: number
  private readonly refillRatePerMs: number
  private readonly capacity: number
  private lastAcquire: Promise<void> = Promise.resolve()

  /**
   * Create a new token bucket rate limiter.
   *
   * @param requestsPerSecond - Rate limit in requests per second (1-10)
   * @throws Error if rate is outside SEC compliance bounds
   */
  constructor(requestsPerSecond: number) {
    // Enforce SEC compliance bounds
    if (requestsPerSecond < 1 || requestsPerSecond > 10) {
      throw new Error("Rate must be 1-10 requests/second")
    }

    // Capacity equals rate to prevent burst escape
    this.capacity = requestsPerSecond

    // Start full to allow one burst on startup
    this.tokens = requestsPerSecond

    // Convert rate to tokens per millisecond for precise timing
    this.refillRatePerMs = requestsPerSecond / 1000

    // Track last refill for elapsed time calculation
    this.lastRefillTime = Date.now()
  }

  /**
   * Acquire tokens from the bucket.
   * If tokens available: returns immediately.
   * If insufficient tokens: waits until tokens refill.
   *
   * @param count - Number of tokens to acquire (default: 1)
   * @returns Promise that resolves when tokens are acquired
   */
  async acquire(count: number = 1): Promise<void> {
    // Chain this acquire after the previous one to ensure sequential processing
    const myAcquire = this.lastAcquire.then(async () => {
      const now = Date.now()
      const elapsedMs = now - this.lastRefillTime

      // Refill tokens based on elapsed time
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsedMs * this.refillRatePerMs,
      )
      this.lastRefillTime = now

      // Tokens available: acquire immediately
      if (this.tokens >= count) {
        this.tokens -= count
        return
      }

      // Tokens insufficient: calculate wait time for the full deficit
      const deficit = count - this.tokens
      const waitMs = deficit / this.refillRatePerMs

      // Deduct all available tokens (partial payment toward the request)
      this.tokens = 0

      // Update lastRefillTime to account for the wait period
      // After waiting, we'll have exactly the tokens we need
      this.lastRefillTime = now + waitMs

      return new Promise<void>((resolve) => {
        setTimeout(resolve, waitMs)
      })
    })

    this.lastAcquire = myAcquire
    return myAcquire
  }
}
