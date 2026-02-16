declare const console: { error: (message: string, extra?: string) => void }

import type { TelemetryOptions, RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

type LatencyStats = {
  count: number
  min: number
  max: number
  avg: number
  total: number
}

export type MetricsSnapshot = {
  requestsTotal: number
  requestsSuccessful: number
  requestsFailed: number
  requestsFailedByError: Record<string, number>
  retriesTotal: number
  latencyByOperation: Record<string, LatencyStats>
  rateLimitedRequests: number
  runtime: "node" | "bun"
}

/**
 * Create a metrics aggregator that tracks request lifecycle and rate limiting metrics.
 *
 * @example
 * ```typescript
 * const metrics = createMetricsAggregator()
 * const client = new EdgarClient({
 *   userAgent: "Bot/1.0",
 *   telemetry: metrics
 * })
 *
 * // Later...
 * const snapshot = metrics.getSnapshot()
 * console.log(snapshot.requestsTotal)
 * console.log(snapshot.latencyByOperation)
 * ```
 */
export function createMetricsAggregator(): TelemetryOptions & {
  getSnapshot(): MetricsSnapshot
  reset(): void
} {
  let requestsTotal = 0
  let requestsSuccessful = 0
  let requestsFailed = 0
  let retriesTotal = 0
  let rateLimitedRequests = 0
  let detectedRuntime: "node" | "bun" = "node"

  const requestsFailedByError: Record<string, number> = {}
  const latencyByOperation: Record<string, LatencyStats> = {}

  const onRequestStart = (event: RequestStartEvent) => {
    try {
      requestsTotal++
      detectedRuntime = event.runtime
    } catch (err) {
      console.error(
        "[edgar-ts/telemetry:metrics-aggregator] Error in onRequestStart:",
        (err as Error).message
      )
    }
  }

  const onRequestEnd = (event: RequestEndEvent) => {
    try {
      const isSuccess = event.statusCode >= 200 && event.statusCode < 300

      if (isSuccess) {
        requestsSuccessful++
      } else {
        requestsFailed++
        const errorKey = String(event.statusCode)
        requestsFailedByError[errorKey] = (requestsFailedByError[errorKey] || 0) + 1
      }

      // Track latency
      const operation = event.operation || "unknown"
      const durationMs = event.durationMs

      if (Number.isNaN(durationMs) || !Number.isFinite(durationMs)) {
        console.error(
          "[edgar-ts/telemetry:metrics-aggregator] Invalid durationMs:",
          String(durationMs)
        )
        return
      }

      if (!latencyByOperation[operation]) {
        latencyByOperation[operation] = {
          count: 0,
          min: Infinity,
          max: -Infinity,
          avg: 0,
          total: 0,
        }
      }

      const stats = latencyByOperation[operation]
      stats.count++
      stats.min = Math.min(stats.min, durationMs)
      stats.max = Math.max(stats.max, durationMs)
      stats.total += durationMs
      stats.avg = stats.total / stats.count
    } catch (err) {
      console.error(
        "[edgar-ts/telemetry:metrics-aggregator] Error in onRequestEnd:",
        (err as Error).message
      )
    }
  }

  const onRetry = (event: RetryEvent) => {
    try {
      retriesTotal++

      if (event.error.includes("RATE_LIMITED")) {
        rateLimitedRequests++
      }
    } catch (err) {
      console.error(
        "[edgar-ts/telemetry:metrics-aggregator] Error in onRetry:",
        (err as Error).message
      )
    }
  }

  const getSnapshot = (): MetricsSnapshot => {
    return {
      requestsTotal,
      requestsSuccessful,
      requestsFailed,
      requestsFailedByError: { ...requestsFailedByError },
      retriesTotal,
      latencyByOperation: { ...latencyByOperation },
      rateLimitedRequests,
      runtime: detectedRuntime,
    }
  }

  const reset = () => {
    requestsTotal = 0
    requestsSuccessful = 0
    requestsFailed = 0
    retriesTotal = 0
    rateLimitedRequests = 0
    Object.keys(requestsFailedByError).forEach(key => delete requestsFailedByError[key])
    Object.keys(latencyByOperation).forEach(key => delete latencyByOperation[key])
  }

  return {
    onRequestStart,
    onRequestEnd,
    onRetry,
    getSnapshot,
    reset,
  }
}
