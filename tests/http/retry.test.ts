// Unit tests for exponential backoff with full jitter

import { describe, expect, it } from "vitest"
import { calculateBackoffMs } from "@/http/retry"
import type { RetryOptions } from "@/types"

describe("calculateBackoffMs", () => {
  const defaultPolicy: RetryOptions = {
    maxAttempts: 3,
    baseDelayMs: 250,
    maxDelayMs: 4000,
  }

  describe("validation", () => {
    it("throws on negative attempt", () => {
      expect(() => calculateBackoffMs(-1, defaultPolicy)).toThrow(
        "Invalid attempt: -1 (must be >= 0)",
      )
    })

    it("throws when attempt >= maxAttempts", () => {
      expect(() => calculateBackoffMs(3, defaultPolicy)).toThrow(
        "Invalid attempt: 3 (must be < maxAttempts=3)",
      )
    })

    it("throws when attempt far exceeds maxAttempts", () => {
      expect(() => calculateBackoffMs(10, defaultPolicy)).toThrow(
        "Invalid attempt: 10 (must be < maxAttempts=3)",
      )
    })
  })

  describe("exponential backoff formula", () => {
    it("attempt 0 returns delay in [0, baseDelayMs)", () => {
      const delay = calculateBackoffMs(0, defaultPolicy)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(250)
    })

    it("attempt 1 returns delay in [0, baseDelayMs * 2)", () => {
      const delay = calculateBackoffMs(1, defaultPolicy)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(500)
    })

    it("attempt 2 returns delay in [0, baseDelayMs * 4)", () => {
      const delay = calculateBackoffMs(2, defaultPolicy)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(1000)
    })
  })

  describe("max delay ceiling", () => {
    it("applies ceiling when exponential cap exceeds maxDelayMs", () => {
      // With base=250, max=4000:
      // attempt 5: exponentialCap = 250 * 2^5 = 8000, capped at 4000
      const policy: RetryOptions = { maxAttempts: 10, baseDelayMs: 250, maxDelayMs: 4000 }

      const delay = calculateBackoffMs(5, policy)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(4000)
    })

    it("respects ceiling across high attempts", () => {
      const policy: RetryOptions = { maxAttempts: 10, baseDelayMs: 250, maxDelayMs: 4000 }

      // Attempts 5+ should all cap at 4000
      for (let attempt = 5; attempt < 10; attempt++) {
        const delay = calculateBackoffMs(attempt, policy)
        expect(delay).toBeLessThan(4000)
      }
    })
  })

  describe("full jitter distribution", () => {
    it("attempt 0: generates varied delays across 100 samples", () => {
      const delays = Array.from({ length: 100 }, () => calculateBackoffMs(0, defaultPolicy))

      // All delays should be in [0, 250)
      const allInRange = delays.every((d) => d >= 0 && d < 250)
      expect(allInRange).toBe(true)

      // Check variance: uniform distribution should have variance
      const mean = delays.reduce((sum, d) => sum + d, 0) / delays.length
      const variance = delays.reduce((sum, d) => sum + (d - mean) ** 2, 0) / delays.length

      // For uniform distribution in [0, 250), variance ≈ (250^2) / 12 ≈ 5208
      // We expect variance > 1000 to ensure non-convergence
      expect(variance).toBeGreaterThan(1000)
    })

    it("attempt 2: generates varied delays across 100 samples", () => {
      const delays = Array.from({ length: 100 }, () => calculateBackoffMs(2, defaultPolicy))

      // All delays should be in [0, 1000)
      const allInRange = delays.every((d) => d >= 0 && d < 1000)
      expect(allInRange).toBe(true)

      // Check variance
      const mean = delays.reduce((sum, d) => sum + d, 0) / delays.length
      const variance = delays.reduce((sum, d) => sum + (d - mean) ** 2, 0) / delays.length

      // For uniform distribution in [0, 1000), variance ≈ (1000^2) / 12 ≈ 83333
      // We expect variance > 10000
      expect(variance).toBeGreaterThan(10000)
    })

    it("capped attempts: generates varied delays across 100 samples", () => {
      const policy: RetryOptions = { maxAttempts: 10, baseDelayMs: 250, maxDelayMs: 4000 }
      const delays = Array.from({ length: 100 }, () => calculateBackoffMs(5, policy))

      // All delays should be in [0, 4000) (capped)
      const allInRange = delays.every((d) => d >= 0 && d < 4000)
      expect(allInRange).toBe(true)

      // Check variance
      const mean = delays.reduce((sum, d) => sum + d, 0) / delays.length
      const variance = delays.reduce((sum, d) => sum + (d - mean) ** 2, 0) / delays.length

      // For uniform distribution in [0, 4000), variance ≈ (4000^2) / 12 ≈ 1333333
      // We expect variance > 100000
      expect(variance).toBeGreaterThan(100000)
    })

    it("multiple concurrent clients get different delays (no synchronization)", () => {
      // Simulate 10 concurrent clients all retrying at the same attempt
      const delays = Array.from({ length: 10 }, () => calculateBackoffMs(1, defaultPolicy))

      // With full jitter, all 10 delays should not be identical
      const uniqueDelays = new Set(delays)
      // In practice, we expect at least some variation (not all 10 identical)
      // Probability of all 10 being same is (1/500)^9 ≈ 0
      // We'll check for at least 5 unique values to be conservative
      expect(uniqueDelays.size).toBeGreaterThanOrEqual(5)
    })
  })

  describe("custom policy", () => {
    it("respects custom baseDelayMs and maxDelayMs", () => {
      const customPolicy: RetryOptions = {
        maxAttempts: 5,
        baseDelayMs: 100,
        maxDelayMs: 1000,
      }

      // attempt 0: [0, 100)
      const delay0 = calculateBackoffMs(0, customPolicy)
      expect(delay0).toBeGreaterThanOrEqual(0)
      expect(delay0).toBeLessThan(100)

      // attempt 3: exponentialCap = 100 * 2^3 = 800, not capped
      const delay3 = calculateBackoffMs(3, customPolicy)
      expect(delay3).toBeGreaterThanOrEqual(0)
      expect(delay3).toBeLessThan(800)

      // attempt 4: exponentialCap = 100 * 2^4 = 1600, capped at 1000
      const delay4 = calculateBackoffMs(4, customPolicy)
      expect(delay4).toBeGreaterThanOrEqual(0)
      expect(delay4).toBeLessThan(1000)
    })

    it("handles very low maxAttempts", () => {
      const policy: RetryOptions = { maxAttempts: 1, baseDelayMs: 500, maxDelayMs: 2000 }

      // Only attempt 0 is valid
      const delay = calculateBackoffMs(0, policy)
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThan(500)

      // attempt 1 should throw
      expect(() => calculateBackoffMs(1, policy)).toThrow()
    })
  })

  describe("edge cases", () => {
    it("handles baseDelayMs === maxDelayMs", () => {
      const policy: RetryOptions = { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 1000 }

      // All attempts should return [0, 1000)
      for (let attempt = 0; attempt < 3; attempt++) {
        const delay = calculateBackoffMs(attempt, policy)
        expect(delay).toBeGreaterThanOrEqual(0)
        expect(delay).toBeLessThan(1000)
      }
    })

    it("returns integer milliseconds (no fractional values)", () => {
      const delays = Array.from({ length: 50 }, () => calculateBackoffMs(1, defaultPolicy))

      // All delays should be integers
      const allIntegers = delays.every((d) => Number.isInteger(d))
      expect(allIntegers).toBe(true)
    })
  })
})
