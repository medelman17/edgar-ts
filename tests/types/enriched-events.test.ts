import { describe, expect, it } from "vitest"
import type { RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

describe("Enriched event types", () => {
  it("RequestStartEvent includes enriched fields", () => {
    const event: RequestStartEvent = {
      url: "https://example.com",
      method: "GET",
      timestamp: Date.now(),
      requestId: "test-id",
      operation: "discoverFilings",
      endpointClass: "submissions",
      runtime: "node",
    }

    expect(event.requestId).toBe("test-id")
    expect(event.operation).toBe("discoverFilings")
    expect(event.endpointClass).toBe("submissions")
    expect(event.runtime).toBe("node")
  })

  it("RequestEndEvent includes enriched fields", () => {
    const event: RequestEndEvent = {
      url: "https://example.com",
      method: "GET",
      statusCode: 200,
      durationMs: 123,
      timestamp: Date.now(),
      requestId: "test-id",
      operation: "listExhibits",
      endpointClass: "archive",
      runtime: "bun",
    }

    expect(event.requestId).toBe("test-id")
    expect(event.operation).toBe("listExhibits")
    expect(event.endpointClass).toBe("archive")
    expect(event.runtime).toBe("bun")
  })

  it("RetryEvent includes enriched fields", () => {
    const event: RetryEvent = {
      url: "https://example.com",
      attempt: 2,
      maxAttempts: 3,
      delayMs: 500,
      error: "TIMEOUT",
      timestamp: Date.now(),
      requestId: "test-id",
      operation: "downloadExhibit",
      endpointClass: "data",
      runtime: "node",
    }

    expect(event.requestId).toBe("test-id")
    expect(event.operation).toBe("downloadExhibit")
    expect(event.endpointClass).toBe("data")
    expect(event.runtime).toBe("node")
  })
})
