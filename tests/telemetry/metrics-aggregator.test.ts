import { describe, expect, it, vi } from "vitest"
import { createMetricsAggregator } from "@/telemetry/metrics-aggregator"
import type { RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

describe("createMetricsAggregator", () => {
  it("increments requestsTotal on onRequestStart", () => {
    const metrics = createMetricsAggregator()
    const event: RequestStartEvent = {
      url: "https://example.com",
      method: "GET",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    }

    metrics.onRequestStart?.(event)
    const snapshot = metrics.getSnapshot()

    expect(snapshot.requestsTotal).toBe(1)
    expect(snapshot.runtime).toBe("node")
  })

  it("increments requestsSuccessful on 2xx status", () => {
    const metrics = createMetricsAggregator()
    const event: RequestEndEvent = {
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "listExhibits",
      endpointClass: "archive",
      runtime: "node",
    }

    metrics.onRequestEnd?.(event)
    const snapshot = metrics.getSnapshot()

    expect(snapshot.requestsSuccessful).toBe(1)
    expect(snapshot.requestsFailed).toBe(0)
  })

  it("increments requestsFailed on 4xx/5xx status", () => {
    const metrics = createMetricsAggregator()
    const event: RequestEndEvent = {
      url: "https://example.com",
      method: "GET",
      statusCode: 500,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "downloadExhibit",
      endpointClass: "archive",
      runtime: "bun",
    }

    metrics.onRequestEnd?.(event)
    const snapshot = metrics.getSnapshot()

    expect(snapshot.requestsSuccessful).toBe(0)
    expect(snapshot.requestsFailed).toBe(1)
  })

  it("tracks failed requests by error type", () => {
    const metrics = createMetricsAggregator()

    // Simulate 500 error
    metrics.onRequestEnd?.({
      url: "https://example.com",
      method: "GET",
      statusCode: 500,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-1",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    })

    // Simulate 429 error
    metrics.onRequestEnd?.({
      url: "https://example.com",
      method: "GET",
      statusCode: 429,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-2",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    })

    const snapshot = metrics.getSnapshot()

    expect(snapshot.requestsFailedByError["500"]).toBe(1)
    expect(snapshot.requestsFailedByError["429"]).toBe(1)
  })

  it("increments retriesTotal on onRetry", () => {
    const metrics = createMetricsAggregator()
    const event: RetryEvent = {
      url: "https://example.com",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 500,
      error: "TIMEOUT",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "downloadExhibit",
      endpointClass: "archive",
      runtime: "node",
    }

    metrics.onRetry?.(event)
    const snapshot = metrics.getSnapshot()

    expect(snapshot.retriesTotal).toBe(1)
  })

  it("tracks latency stats per operation", () => {
    const metrics = createMetricsAggregator()

    metrics.onRequestEnd?.({
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-1",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    })

    metrics.onRequestEnd?.({
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 300,
      timestamp: Date.now(),
      requestId: "abc-2",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    })

    const snapshot = metrics.getSnapshot()
    const latency = snapshot.latencyByOperation.discoverFilings

    expect(latency.count).toBe(2)
    expect(latency.min).toBe(100)
    expect(latency.max).toBe(300)
    expect(latency.avg).toBe(200)
  })

  it("detects rate limiting from retry errors", () => {
    const metrics = createMetricsAggregator()

    metrics.onRetry?.({
      url: "https://example.com",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 500,
      error: "RATE_LIMITED",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    })

    const snapshot = metrics.getSnapshot()

    expect(snapshot.rateLimitedRequests).toBe(1)
  })

  it("resets all counters when reset() called", () => {
    const metrics = createMetricsAggregator()

    metrics.onRequestStart?.({
      url: "https://example.com",
      method: "GET",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    })

    expect(metrics.getSnapshot().requestsTotal).toBe(1)

    metrics.reset()

    expect(metrics.getSnapshot().requestsTotal).toBe(0)
  })

  it("handles missing operation field gracefully", () => {
    const metrics = createMetricsAggregator()

    // @ts-expect-error - testing error handling
    metrics.onRequestEnd?.({
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-123",
      endpointClass: "test",
      runtime: "node",
    })

    const snapshot = metrics.getSnapshot()

    expect(snapshot.latencyByOperation.unknown).toBeDefined()
  })

  it("handles invalid numeric values gracefully", () => {
    const metrics = createMetricsAggregator()
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    metrics.onRequestEnd?.({
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: NaN,
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    })

    expect(errorSpy).toHaveBeenCalled()

    errorSpy.mockRestore()
  })
})
