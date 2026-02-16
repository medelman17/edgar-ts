import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createStructuredLogger } from "@/telemetry/structured-logger"
import type { RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

describe("createStructuredLogger", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
  })

  afterEach(() => {
    stdoutSpy.mockRestore()
  })

  it("outputs JSON Lines format for onRequestStart", () => {
    const logger = createStructuredLogger()
    const event: RequestStartEvent = {
      url: "https://example.com",
      method: "GET",
      timestamp: 1234567890,
      requestId: "abc-123",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    }

    logger.onRequestStart?.(event)

    const output = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)

    expect(parsed.event).toBe("request.start")
    expect(parsed.url).toBe("https://example.com")
    expect(parsed.method).toBe("GET")
    expect(parsed.requestId).toBe("abc-123")
    expect(parsed.operation).toBe("discoverFilings")
    expect(output.endsWith("\n")).toBe(true)
  })

  it("outputs JSON Lines format for onRequestEnd", () => {
    const logger = createStructuredLogger()
    const event: RequestEndEvent = {
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 1234,
      timestamp: 1234567890,
      requestId: "abc-123",
      operation: "listExhibits",
      endpointClass: "archive",
      runtime: "bun",
    }

    logger.onRequestEnd?.(event)

    const output = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)

    expect(parsed.event).toBe("request.end")
    expect(parsed.statusCode).toBe(200)
    expect(parsed.durationMs).toBe(1234)
  })

  it("outputs JSON Lines format for onRetry", () => {
    const logger = createStructuredLogger()
    const event: RetryEvent = {
      url: "https://example.com",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 500,
      error: "TIMEOUT",
      timestamp: 1234567890,
      requestId: "abc-123",
      operation: "downloadExhibit",
      endpointClass: "archive",
      runtime: "node",
    }

    logger.onRetry?.(event)

    const output = stdoutSpy.mock.calls[0][0] as string
    const parsed = JSON.parse(output)

    expect(parsed.event).toBe("request.retry")
    expect(parsed.attempt).toBe(2)
    expect(parsed.error).toBe("TIMEOUT")
  })

  it("can use custom stream", () => {
    const customStream = {
      write: vi.fn(() => true),
      writable: true,
    } as unknown as NodeJS.WritableStream

    const logger = createStructuredLogger({ stream: customStream })
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

  it("can use custom formatter", () => {
    const formatter = (event: unknown) => `CUSTOM:${(event as { operation: string }).operation}`
    const logger = createStructuredLogger({ formatter })
    const event: RequestStartEvent = {
      url: "https://example.com",
      method: "GET",
      timestamp: Date.now(),
      requestId: "abc-123",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    }

    logger.onRequestStart?.(event)

    const output = stdoutSpy.mock.calls[0][0] as string
    expect(output).toBe("CUSTOM:discoverFilings\n")
  })

  it("handles serialization errors gracefully", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const logger = createStructuredLogger()

    const circular: { a: number; self?: unknown } = { a: 1 }
    circular.self = circular

    // @ts-expect-error - testing error handling
    logger.onRequestStart?.(circular)

    expect(errorSpy).toHaveBeenCalled()
    const call = errorSpy.mock.calls[0][0] as string
    expect(call).toContain("[edgar-ts/telemetry:structured-logger]")

    errorSpy.mockRestore()
  })

  it("validates stream is writable at creation time", () => {
    const closedStream = {
      writable: false,
    } as unknown as NodeJS.WritableStream

    expect(() => {
      createStructuredLogger({ stream: closedStream })
    }).toThrow("stream must be writable")
  })
})
