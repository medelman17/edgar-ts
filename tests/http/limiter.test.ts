import { beforeEach, describe, expect, it, vi } from "vitest"
import { TokenBucket } from "@/http/limiter"

describe("TokenBucket", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  describe("constructor", () => {
    it("creates limiter with valid rate", () => {
      expect(() => new TokenBucket(8)).not.toThrow()
    })

    it("rejects rate below 1", () => {
      expect(() => new TokenBucket(0)).toThrow("Rate must be 1-10 requests/second")
    })

    it("rejects rate above 10", () => {
      expect(() => new TokenBucket(11)).toThrow("Rate must be 1-10 requests/second")
    })

    it("accepts boundary values 1 and 10", () => {
      expect(() => new TokenBucket(1)).not.toThrow()
      expect(() => new TokenBucket(10)).not.toThrow()
    })
  })

  describe("acquire", () => {
    it("allows immediate acquire when bucket is full", async () => {
      const limiter = new TokenBucket(8)

      const start = Date.now()
      await limiter.acquire(1)
      const elapsed = Date.now() - start

      expect(elapsed).toBe(0) // Should be immediate
    })

    it("allows burst up to capacity on startup", async () => {
      vi.setSystemTime(0)
      const limiter = new TokenBucket(8)

      const start = Date.now()

      // Should acquire 8 tokens immediately
      const promises = Array.from({ length: 8 }, () => limiter.acquire(1))

      await Promise.all(promises)

      const elapsed = Date.now() - start

      // All should complete without advancing time
      expect(elapsed).toBe(0)
    })

    it("blocks when tokens exhausted", async () => {
      const limiter = new TokenBucket(8)

      // Exhaust initial 8 tokens
      await Promise.all(Array.from({ length: 8 }, () => limiter.acquire(1)))

      // 9th request should wait
      const promise = limiter.acquire(1)

      // Advance time by 100ms (should refill ~0.8 tokens)
      await vi.advanceTimersByTimeAsync(100)

      // Still not enough tokens
      expect(promise).toBeDefined()

      // Advance by another 25ms (total 125ms = 1 token)
      await vi.advanceTimersByTimeAsync(25)

      await promise // Should resolve now
    })

    it("enforces rate cap under concurrent load", async () => {
      vi.setSystemTime(0)
      const limiter = new TokenBucket(8)

      const startTime = Date.now()

      // Fire 100 concurrent requests
      const promises = Array.from({ length: 100 }, () => limiter.acquire(1))

      // Run all timers to completion
      await vi.runAllTimersAsync()

      await Promise.all(promises)

      const elapsed = Date.now() - startTime

      // 100 requests at 8 req/s should take >= 11.5 seconds (11500ms)
      // First 8 are immediate, remaining 92 take 92/8 = 11.5s
      expect(elapsed).toBeGreaterThanOrEqual(11500)
    })

    it("refills tokens over time", async () => {
      const limiter = new TokenBucket(8)

      // Exhaust initial tokens
      await Promise.all(Array.from({ length: 8 }, () => limiter.acquire(1)))

      // Wait 1 second (should refill 8 tokens)
      await vi.advanceTimersByTimeAsync(1000)

      // Should acquire 8 more immediately
      const start = Date.now()
      await Promise.all(Array.from({ length: 8 }, () => limiter.acquire(1)))
      const elapsed = Date.now() - start

      expect(elapsed).toBe(0)
    })

    it("respects capacity ceiling during refill", async () => {
      const limiter = new TokenBucket(8)

      // Don't use any tokens
      // Wait 10 seconds
      await vi.advanceTimersByTimeAsync(10000)

      // Tokens should be capped at capacity (8), not 80
      // So we should be able to acquire 8 immediately, then wait
      await Promise.all(Array.from({ length: 8 }, () => limiter.acquire(1)))

      const promise = limiter.acquire(1)

      // Should need to wait
      await vi.advanceTimersByTimeAsync(125)
      await promise
    })

    it("handles fractional token calculations", async () => {
      const limiter = new TokenBucket(8)

      // Exhaust tokens
      await Promise.all(Array.from({ length: 8 }, () => limiter.acquire(1)))

      // Advance 100ms → 0.8 tokens available
      await vi.advanceTimersByTimeAsync(100)

      // Request should wait for remaining 0.2 tokens = 25ms
      const promise = limiter.acquire(1)
      await vi.advanceTimersByTimeAsync(25)
      await promise
    })

    it("supports acquiring multiple tokens", async () => {
      const limiter = new TokenBucket(8)

      // Acquire 5 tokens at once
      await limiter.acquire(5)

      // Should have 3 remaining
      await limiter.acquire(3)

      // Next request should wait
      const promise = limiter.acquire(1)
      await vi.advanceTimersByTimeAsync(125)
      await promise
    })

    it("maintains accuracy over many requests", async () => {
      const limiter = new TokenBucket(8)
      const requestCount = 80

      const startTime = Date.now()

      // Fire requests in sequence (not parallel)
      for (let i = 0; i < requestCount; i++) {
        const promise = limiter.acquire(1)
        // Advance timer to allow refill
        if (i >= 8) {
          await vi.advanceTimersByTimeAsync(125)
        }
        await promise
      }

      const elapsed = Date.now() - startTime

      // 80 requests at 8 req/s should take ~10 seconds
      // First 8 immediate, remaining 72 take 72/8 = 9s
      expect(elapsed).toBeGreaterThanOrEqual(9000)
      expect(elapsed).toBeLessThanOrEqual(10000)
    })
  })
})
