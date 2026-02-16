import { describe, expect, it } from "vitest"
import { createNoopTelemetry } from "@/telemetry/noop"

describe("createNoopTelemetry", () => {
  it("returns TelemetryOptions with empty functions", () => {
    const telemetry = createNoopTelemetry()

    expect(telemetry.onRequestStart).toBeTypeOf("function")
    expect(telemetry.onRequestEnd).toBeTypeOf("function")
    expect(telemetry.onRetry).toBeTypeOf("function")
  })

  it("hooks do nothing when called", () => {
    const telemetry = createNoopTelemetry()

    expect(() => {
      telemetry.onRequestStart?.({
        url: "https://example.com",
        method: "GET",
        timestamp: Date.now(),
        requestId: "test-id",
        operation: "test",
        endpointClass: "test",
        runtime: "node",
      })
      telemetry.onRequestEnd?.({
        url: "https://example.com",
        method: "GET",
        statusCode: 200,
        durationMs: 100,
        timestamp: Date.now(),
        requestId: "test-id",
        operation: "test",
        endpointClass: "test",
        runtime: "node",
      })
      telemetry.onRetry?.({
        url: "https://example.com",
        attempt: 1,
        maxAttempts: 3,
        delayMs: 250,
        error: "TIMEOUT",
        timestamp: Date.now(),
        requestId: "test-id",
        operation: "test",
        endpointClass: "test",
        runtime: "node",
      })
    }).not.toThrow()
  })
})
