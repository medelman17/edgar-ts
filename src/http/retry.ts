// Exponential backoff with full jitter for retry policy
// AWS best practice: uniformly distributed delays prevent thundering herd

import type { RetryOptions } from "@/types"

/**
 * Calculate exponential backoff delay with full jitter
 *
 * Formula: random(0, min(maxDelayMs, baseDelayMs * 2^attempt))
 *
 * Full jitter ensures uniformly distributed delays across concurrent clients,
 * preventing synchronized retry spikes ("thundering herd" problem).
 *
 * @param attempt - Zero-indexed retry attempt (0 = first retry)
 * @param policy - Retry policy configuration
 * @returns Delay in milliseconds (integer)
 * @throws Error if attempt is out of bounds
 *
 * @example
 * // Default policy: baseDelayMs=250, maxDelayMs=4000, maxAttempts=3
 * calculateBackoffMs(0, defaultPolicy) // → random(0, 250)
 * calculateBackoffMs(1, defaultPolicy) // → random(0, 500)
 * calculateBackoffMs(2, defaultPolicy) // → random(0, 1000)
 */
export function calculateBackoffMs(attempt: number, policy: RetryOptions): number {
  // Validate attempt bounds
  if (attempt < 0) {
    throw new Error(`Invalid attempt: ${attempt} (must be >= 0)`)
  }

  if (attempt >= policy.maxAttempts) {
    throw new Error(
      `Invalid attempt: ${attempt} (must be < maxAttempts=${policy.maxAttempts})`,
    )
  }

  // Calculate exponential cap: baseDelayMs * 2^attempt
  const exponentialCap = policy.baseDelayMs * 2 ** attempt

  // Apply max delay ceiling
  const maxJitter = Math.min(policy.maxDelayMs, exponentialCap)

  // Full jitter: uniformly distributed in [0, maxJitter)
  return Math.floor(Math.random() * maxJitter)
}
