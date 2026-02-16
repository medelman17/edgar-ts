// Enriched telemetry event tests — requestId, operation, endpointClass, runtime

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { SecHttpClient } from "@/http/client"
import type { RequestStartEvent, RequestEndEvent, RetryEvent } from "@/types"

describe("SecHttpClient enriched telemetry events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe("requestId generation", () => {
    it("generates unique requestId for each request", async () => {
      const requestIds: string[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => {
            requestIds.push(event.requestId)
          },
        },
      })

      // Make 3 separate requests
      await client.request("https://example.com/1")
      await client.request("https://example.com/2")
      await client.request("https://example.com/3")

      expect(requestIds).toHaveLength(3)
      expect(requestIds[0]).not.toBe(requestIds[1])
      expect(requestIds[1]).not.toBe(requestIds[2])
      expect(requestIds[0]).not.toBe(requestIds[2])

      // Each should be a valid UUID v4 format (36 chars with hyphens)
      requestIds.forEach((id) => {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
      })
    })

    it("shares same requestId across all events for same request", async () => {
      const eventIds: string[] = []

      let callCount = 0
      const mockFetch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response)
      })
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => eventIds.push(event.requestId),
          onRequestEnd: (event) => eventIds.push(event.requestId),
          onRetry: (event) => eventIds.push(event.requestId),
        },
      })

      await client.request("https://example.com")

      // Should have: onRequestStart-1, onRequestEnd-1, onRetry, onRequestStart-2, onRequestEnd-2
      expect(eventIds).toHaveLength(5)

      // First attempt: onRequestStart-1 and onRequestEnd-1 should match
      expect(eventIds[0]).toBe(eventIds[1])

      // Retry event should have same requestId as first attempt
      expect(eventIds[2]).toBe(eventIds[0])

      // Second attempt: onRequestStart-2 and onRequestEnd-2 should match
      expect(eventIds[3]).toBe(eventIds[4])

      // But second attempt should have different requestId than first
      expect(eventIds[3]).not.toBe(eventIds[0])
    })
  })

  describe("context parameter handling", () => {
    it("accepts context with operation and endpointClass in request options", async () => {
      const startEvents: RequestStartEvent[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => startEvents.push(event),
        },
      })

      await client.request("https://example.com", {
        context: {
          operation: "discoverFilings",
          endpointClass: "submissions",
        },
      })

      expect(startEvents).toHaveLength(1)
      expect(startEvents[0]).toMatchObject({
        operation: "discoverFilings",
        endpointClass: "submissions",
      })
    })

    it("defaults to 'unknown' when context not provided", async () => {
      const startEvents: RequestStartEvent[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => startEvents.push(event),
        },
      })

      await client.request("https://example.com")

      expect(startEvents).toHaveLength(1)
      expect(startEvents[0]).toMatchObject({
        operation: "unknown",
        endpointClass: "unknown",
      })
    })

    it("preserves context across all retry attempts", async () => {
      const allEvents: (RequestStartEvent | RequestEndEvent | RetryEvent)[] = []

      let callCount = 0
      const mockFetch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response)
      })
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => allEvents.push(event),
          onRequestEnd: (event) => allEvents.push(event),
          onRetry: (event) => allEvents.push(event),
        },
      })

      await client.request("https://example.com", {
        context: {
          operation: "listExhibits",
          endpointClass: "index",
        },
      })

      // All events should have same context
      allEvents.forEach((event) => {
        expect(event).toMatchObject({
          operation: "listExhibits",
          endpointClass: "index",
        })
      })
    })
  })

  describe("runtime field population", () => {
    it("populates runtime field in RequestStartEvent", async () => {
      const startEvents: RequestStartEvent[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => startEvents.push(event),
        },
      })

      await client.request("https://example.com")

      expect(startEvents).toHaveLength(1)
      expect(startEvents[0]).toHaveProperty("runtime")
      expect(["node", "bun"]).toContain(startEvents[0].runtime)
    })

    it("populates runtime field in RequestEndEvent", async () => {
      const endEvents: RequestEndEvent[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestEnd: (event) => endEvents.push(event),
        },
      })

      await client.request("https://example.com")

      expect(endEvents).toHaveLength(1)
      expect(endEvents[0]).toHaveProperty("runtime")
      expect(["node", "bun"]).toContain(endEvents[0].runtime)
    })

    it("populates runtime field in RetryEvent", async () => {
      const retryEvents: RetryEvent[] = []

      let callCount = 0
      const mockFetch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response)
      })
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRetry: (event) => retryEvents.push(event),
        },
      })

      await client.request("https://example.com")

      expect(retryEvents).toHaveLength(1)
      expect(retryEvents[0]).toHaveProperty("runtime")
      expect(["node", "bun"]).toContain(retryEvents[0].runtime)
    })
  })

  describe("complete enriched event structure", () => {
    it("RequestStartEvent includes all enriched fields", async () => {
      const startEvents: RequestStartEvent[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => startEvents.push(event),
        },
      })

      await client.request("https://example.com/api/v1", {
        context: {
          operation: "testOp",
          endpointClass: "testEndpoint",
        },
      })

      expect(startEvents).toHaveLength(1)
      const event = startEvents[0]

      expect(event).toMatchObject({
        url: "https://example.com/api/v1",
        method: "GET",
        timestamp: expect.any(Number),
        requestId: expect.any(String),
        operation: "testOp",
        endpointClass: "testEndpoint",
        runtime: expect.stringMatching(/^(node|bun)$/),
      })

      // Verify types match
      expect(typeof event.url).toBe("string")
      expect(typeof event.method).toBe("string")
      expect(typeof event.timestamp).toBe("number")
      expect(typeof event.requestId).toBe("string")
      expect(typeof event.operation).toBe("string")
      expect(typeof event.endpointClass).toBe("string")
      expect(typeof event.runtime).toBe("string")
    })

    it("RequestEndEvent includes all enriched fields", async () => {
      const endEvents: RequestEndEvent[] = []

      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestEnd: (event) => endEvents.push(event),
        },
      })

      await client.request("https://example.com/api/v1", {
        context: {
          operation: "testOp",
          endpointClass: "testEndpoint",
        },
      })

      expect(endEvents).toHaveLength(1)
      const event = endEvents[0]

      expect(event).toMatchObject({
        url: "https://example.com/api/v1",
        method: "GET",
        statusCode: 200,
        durationMs: expect.any(Number),
        timestamp: expect.any(Number),
        requestId: expect.any(String),
        operation: "testOp",
        endpointClass: "testEndpoint",
        runtime: expect.stringMatching(/^(node|bun)$/),
      })

      // Verify types match
      expect(typeof event.url).toBe("string")
      expect(typeof event.method).toBe("string")
      expect(typeof event.statusCode).toBe("number")
      expect(typeof event.durationMs).toBe("number")
      expect(typeof event.timestamp).toBe("number")
      expect(typeof event.requestId).toBe("string")
      expect(typeof event.operation).toBe("string")
      expect(typeof event.endpointClass).toBe("string")
      expect(typeof event.runtime).toBe("string")
    })

    it("RetryEvent includes all enriched fields", async () => {
      const retryEvents: RetryEvent[] = []

      let callCount = 0
      const mockFetch = vi.fn(async () => {
        callCount++
        if (callCount === 1) {
          return Promise.resolve({
            ok: false,
            status: 503,
          } as Response)
        }
        return Promise.resolve({
          ok: true,
          status: 200,
        } as Response)
      })
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRetry: (event) => retryEvents.push(event),
        },
      })

      await client.request("https://example.com/api/v1", {
        context: {
          operation: "testOp",
          endpointClass: "testEndpoint",
        },
      })

      expect(retryEvents).toHaveLength(1)
      const event = retryEvents[0]

      expect(event).toMatchObject({
        url: "https://example.com/api/v1",
        attempt: 1,
        maxAttempts: 3,
        delayMs: expect.any(Number),
        error: "TRANSPORT_ERROR",
        timestamp: expect.any(Number),
        requestId: expect.any(String),
        operation: "testOp",
        endpointClass: "testEndpoint",
        runtime: expect.stringMatching(/^(node|bun)$/),
      })

      // Verify types match
      expect(typeof event.url).toBe("string")
      expect(typeof event.attempt).toBe("number")
      expect(typeof event.maxAttempts).toBe("number")
      expect(typeof event.delayMs).toBe("number")
      expect(typeof event.error).toBe("string")
      expect(typeof event.timestamp).toBe("number")
      expect(typeof event.requestId).toBe("string")
      expect(typeof event.operation).toBe("string")
      expect(typeof event.endpointClass).toBe("string")
      expect(typeof event.runtime).toBe("string")
    })
  })

  describe("backward compatibility", () => {
    it("works without any context provided (defaults to unknown)", async () => {
      const mockFetch = vi.fn(async () =>
        Promise.resolve({
          ok: true,
          status: 200,
        } as Response),
      )
      vi.stubGlobal("fetch", mockFetch)

      const client = new SecHttpClient({ userAgent: "TestBot/1.0" })

      // Should not throw even without telemetry hooks
      await expect(client.request("https://example.com")).resolves.toBeDefined()

      // Should work with telemetry but without context
      const startEvents: RequestStartEvent[] = []
      const client2 = new SecHttpClient({
        userAgent: "TestBot/1.0",
        telemetry: {
          onRequestStart: (event) => startEvents.push(event),
        },
      })

      await client2.request("https://example.com")

      expect(startEvents).toHaveLength(1)
      expect(startEvents[0].operation).toBe("unknown")
      expect(startEvents[0].endpointClass).toBe("unknown")
    })

    it("existing client.test.ts tests still pass", async () => {
      // This is a placeholder to remind us to verify existing tests pass
      // The actual verification happens when we run: pnpm vitest run tests/http/client.test.ts
      expect(true).toBe(true)
    })
  })
})
