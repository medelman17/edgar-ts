import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EdgarClient } from "@/client"
import { createConsoleLogger, createMetricsAggregator, createStructuredLogger } from "@/telemetry"

describe("Telemetry integration", () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
  })

  it("console logger works with real EdgarClient", async () => {
    const stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true)
    const mockFetch = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          filings: {
            recent: {
              accessionNumber: ["0001193125-21-000001"],
              filingDate: ["2021-01-01"],
              reportDate: ["2021-01-01"],
              acceptanceDateTime: ["2021-01-01 00:00:00"],
              act: ["34"],
              form: ["10-K"],
              fileNumber: ["000-12345"],
              filmNumber: [""],
              items: [""],
              size: ["12345"],
              isXBRL: [0],
              isInlineXBRL: [0],
              primaryDocument: ["document.htm"],
              primaryDocDescription: ["10-K"],
            },
          },
        }),
      } as Response),
    )
    global.fetch = mockFetch

    const client = new EdgarClient({
      userAgent: "TestBot/1.0 (test@example.com)",
      telemetry: createConsoleLogger({ colors: false }),
    })

    await client.discoverFilings({
      from: "2021-01-01",
      to: "2021-12-31",
      cik: "0000320193",
    })

    expect(stderrSpy).toHaveBeenCalled()
    const output = stderrSpy.mock.calls.map((c) => c[0]).join("")
    expect(output).toContain("discoverFilings")
    expect(output).toContain("200")

    stderrSpy.mockRestore()
  })

  it("metrics aggregator tracks real EdgarClient requests", async () => {
    const metrics = createMetricsAggregator()
    const mockFetch = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          filings: {
            recent: {
              accessionNumber: ["0001193125-21-000001"],
              filingDate: ["2021-01-01"],
              reportDate: ["2021-01-01"],
              acceptanceDateTime: ["2021-01-01 00:00:00"],
              act: ["34"],
              form: ["10-K"],
              fileNumber: ["000-12345"],
              filmNumber: [""],
              items: [""],
              size: ["12345"],
              isXBRL: [0],
              isInlineXBRL: [0],
              primaryDocument: ["document.htm"],
              primaryDocDescription: ["10-K"],
            },
          },
        }),
      } as Response),
    )
    global.fetch = mockFetch

    const client = new EdgarClient({
      userAgent: "TestBot/1.0 (test@example.com)",
      telemetry: metrics,
    })

    await client.discoverFilings({
      from: "2021-01-01",
      to: "2021-12-31",
      cik: "0000320193",
    })

    const snapshot = metrics.getSnapshot()

    expect(snapshot.requestsTotal).toBeGreaterThan(0)
    expect(snapshot.requestsSuccessful).toBeGreaterThan(0)
    expect(snapshot.latencyByOperation.discoverFilings).toBeDefined()
  })

  it("multiple helpers can be combined", async () => {
    const metrics = createMetricsAggregator()
    const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true)

    const combined = {
      onRequestStart: (event: RequestStartEvent) => {
        metrics.onRequestStart?.(event)
        createStructuredLogger().onRequestStart?.(event)
      },
      onRequestEnd: (event: RequestEndEvent) => {
        metrics.onRequestEnd?.(event)
        createStructuredLogger().onRequestEnd?.(event)
      },
      onRetry: (event: RetryEvent) => {
        metrics.onRetry?.(event)
        createStructuredLogger().onRetry?.(event)
      },
    }

    const mockFetch = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          filings: {
            recent: {
              accessionNumber: ["0001193125-21-000001"],
              filingDate: ["2021-01-01"],
              reportDate: ["2021-01-01"],
              acceptanceDateTime: ["2021-01-01 00:00:00"],
              act: ["34"],
              form: ["10-K"],
              fileNumber: ["000-12345"],
              filmNumber: [""],
              items: [""],
              size: ["12345"],
              isXBRL: [0],
              isInlineXBRL: [0],
              primaryDocument: ["document.htm"],
              primaryDocDescription: ["10-K"],
            },
          },
        }),
      } as Response),
    )
    global.fetch = mockFetch

    const client = new EdgarClient({
      userAgent: "TestBot/1.0 (test@example.com)",
      telemetry: combined,
    })

    await client.discoverFilings({
      from: "2021-01-01",
      to: "2021-12-31",
      cik: "0000320193",
    })

    expect(metrics.getSnapshot().requestsTotal).toBeGreaterThan(0)
    expect(stdoutSpy).toHaveBeenCalled()

    stdoutSpy.mockRestore()
  })

  it.skip("telemetry errors don't break client requests", async () => {
    const brokenLogger = {
      onRequestStart: () => {
        throw new Error("Intentional error")
      },
      onRequestEnd: () => {},
      onRetry: () => {},
    }

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    const mockFetch = vi.fn(async () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({
          filings: {
            recent: {
              accessionNumber: ["0001193125-21-000001"],
              filingDate: ["2021-01-01"],
              reportDate: ["2021-01-01"],
              acceptanceDateTime: ["2021-01-01 00:00:00"],
              act: ["34"],
              form: ["10-K"],
              fileNumber: ["000-12345"],
              filmNumber: [""],
              items: [""],
              size: ["12345"],
              isXBRL: [0],
              isInlineXBRL: [0],
              primaryDocument: ["document.htm"],
              primaryDocDescription: ["10-K"],
            },
          },
        }),
      } as Response),
    )
    global.fetch = mockFetch

    const client = new EdgarClient({
      userAgent: "TestBot/1.0 (test@example.com)",
      telemetry: brokenLogger,
    })

    // Should NOT throw despite broken telemetry
    await expect(
      client.discoverFilings({
        from: "2021-01-01",
        to: "2021-12-31",
        cik: "0000320193",
      }),
    ).resolves.toBeDefined()

    errorSpy.mockRestore()
  })
})
