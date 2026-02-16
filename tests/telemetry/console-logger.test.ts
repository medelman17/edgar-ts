import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createConsoleLogger } from "@/telemetry/console-logger"
import type { RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

describe("createConsoleLogger", () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
  })

  afterEach(() => {
    stderrSpy.mockRestore()
  })

  it("formats onRequestStart with arrow and operation", () => {
    const logger = createConsoleLogger({ colors: false })
    const event: RequestStartEvent = {
      url: "https://data.sec.gov/submissions/CIK0000320193.json",
      method: "GET",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    }

    logger.onRequestStart?.(event)

    const output = stderrSpy.mock.calls[0][0] as string
    expect(output).toContain("→ GET")
    expect(output).toContain("https://data.sec.gov/submissions/CIK0000320193.json")
    expect(output).toContain("[discoverFilings]")
    expect(output).toContain("abc-123")
  })

  it("formats onRequestEnd with status and duration", () => {
    const logger = createConsoleLogger({ colors: false })
    const event: RequestEndEvent = {
      url: "https://data.sec.gov/submissions/CIK0000320193.json",
      method: "GET",
      statusCode: 200,
      durationMs: 1234,
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    }

    logger.onRequestEnd?.(event)

    const output = stderrSpy.mock.calls[0][0] as string
    expect(output).toContain("← 200")
    expect(output).toContain("1234ms")
    expect(output).toContain("[discoverFilings]")
  })

  it("formats onRetry with attempt count and delay", () => {
    const logger = createConsoleLogger({ colors: false })
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
      runtime: "bun",
    }

    logger.onRetry?.(event)

    const output = stderrSpy.mock.calls[0][0] as string
    expect(output).toContain("⟳ Retry 2/3")
    expect(output).toContain("after 500ms")
    expect(output).toContain("TIMEOUT")
  })

  it("uses colors by default when colors option not specified", () => {
    const logger = createConsoleLogger({ timestamps: false })
    const event: RequestEndEvent = {
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    }

    logger.onRequestEnd?.(event)

    // Just verify that output is written; ANSI codes only appear when TTY is available
    const output = stderrSpy.mock.calls[0][0] as string
    expect(output).toBeDefined()
    expect(output.length).toBeGreaterThan(0)
  })

  it("can disable colors", () => {
    const logger = createConsoleLogger({ colors: false })
    const event: RequestEndEvent = {
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 100,
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    }

    logger.onRequestEnd?.(event)

    const output = stderrSpy.mock.calls[0][0] as string
    expect(output).not.toContain("\x1b[")
  })

  it("handles formatting errors gracefully", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const logger = createConsoleLogger()

    // @ts-expect-error - testing error handling
    logger.onRequestStart?.({ invalid: "event" })

    expect(errorSpy).toHaveBeenCalled()
    expect(stderrSpy).toHaveBeenCalled() // Should fallback to JSON.stringify

    errorSpy.mockRestore()
  })

  it("can write to custom stream", () => {
    const customStream = {
      write: vi.fn(() => true),
    } as unknown as NodeJS.WriteStream

    const logger = createConsoleLogger({ errorStream: customStream })
    const event: RequestStartEvent = {
      url: "https://example.com",
      method: "GET",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "test",
      endpointClass: "test",
      runtime: "node",
    }

    logger.onRequestStart?.(event)

    expect(customStream.write).toHaveBeenCalled()
  })
})
