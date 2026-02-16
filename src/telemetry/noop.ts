import type { TelemetryOptions } from "@/types"

/**
 * Create a no-op telemetry implementation (all hooks are empty functions).
 * Useful for testing or explicitly disabling telemetry without removing code.
 *
 * @example
 * ```typescript
 * const client = new EdgarClient({
 *   userAgent: "Bot/1.0",
 *   telemetry: createNoopTelemetry()
 * })
 * ```
 */
export function createNoopTelemetry(): TelemetryOptions {
  return {
    onRequestStart: () => {},
    onRequestEnd: () => {},
    onRetry: () => {},
  }
}
