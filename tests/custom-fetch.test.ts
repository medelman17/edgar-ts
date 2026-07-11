// Tests for custom fetch injection into EdgarClient and SecHttpClient

import { afterEach, describe, expect, it, vi } from "vitest"
import { EdgarClient } from "@/client"
import { SecHttpClient } from "@/http/client"
import type { FetchFn } from "@/types"

describe("custom fetch injection", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe("SecHttpClient", () => {
    it("uses injected fetch instead of global fetch", async () => {
      const injectedFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
      }))

      const globalMock = vi.fn()
      vi.stubGlobal("fetch", globalMock)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        fetch: injectedFetch as FetchFn,
      })

      await client.request("https://example.com/test")

      expect(injectedFetch).toHaveBeenCalledTimes(1)
      expect(globalMock).not.toHaveBeenCalled()
    })

    it("falls back to global fetch when none provided", async () => {
      const globalMock = vi.fn(async () => ({
        ok: true,
        status: 200,
      }))
      vi.stubGlobal("fetch", globalMock)

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      await client.request("https://example.com/test")

      expect(globalMock).toHaveBeenCalledTimes(1)
    })

    it("passes url and init to the injected fetch", async () => {
      const injectedFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
      }))

      const client = new SecHttpClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        fetch: injectedFetch as FetchFn,
      })

      await client.request("https://efts.sec.gov/LATEST/search-index")

      expect(injectedFetch).toHaveBeenCalledWith(
        "https://efts.sec.gov/LATEST/search-index",
        expect.objectContaining({
          signal: expect.anything(),
          headers: expect.anything(),
        }),
      )
    })
  })

  describe("EdgarClient", () => {
    it("forwards injected fetch to underlying SecHttpClient", async () => {
      const injectedFetch = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          cik: "0000320193",
          name: "Apple Inc.",
          tickers: ["AAPL"],
          exchanges: ["Nasdaq"],
          filings: {
            recent: {
              accessionNumber: [],
              filingDate: [],
              reportDate: [],
              acceptanceDateTime: [],
              act: [],
              form: [],
              fileNumber: [],
              primaryDocument: [],
              primaryDocDescription: [],
              size: [],
              isXBRL: [],
              isInlineXBRL: [],
            },
            files: [],
          },
        }),
      }))

      const globalMock = vi.fn()
      vi.stubGlobal("fetch", globalMock)

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        fetch: injectedFetch as FetchFn,
      })

      await client.getCompanyInfo("320193")

      expect(injectedFetch).toHaveBeenCalled()
      expect(globalMock).not.toHaveBeenCalled()
    })

    it("works without fetch option (backward compatible)", async () => {
      const globalMock = vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          cik: "0000320193",
          name: "Apple Inc.",
          tickers: ["AAPL"],
          exchanges: ["Nasdaq"],
          filings: {
            recent: {
              accessionNumber: [],
              filingDate: [],
              reportDate: [],
              acceptanceDateTime: [],
              act: [],
              form: [],
              fileNumber: [],
              primaryDocument: [],
              primaryDocDescription: [],
              size: [],
              isXBRL: [],
              isInlineXBRL: [],
            },
            files: [],
          },
        }),
      }))
      vi.stubGlobal("fetch", globalMock)

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      await client.getCompanyInfo("320193")

      expect(globalMock).toHaveBeenCalled()
    })
  })

  describe("type compatibility", () => {
    it("accepts a function matching the FetchFn signature", () => {
      // This test verifies the type system accepts a valid FetchFn.
      // If this compiles and runs without error, the type is correct.
      const customFetch: FetchFn = async (_url, _init) => {
        return { ok: true, status: 200 }
      }

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        fetch: customFetch,
      })

      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts globalThis.fetch directly", () => {
      // globalThis.fetch is assignable to FetchFn because FetchFn uses
      // a broad init parameter (Record<string, unknown>)
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        fetch: globalThis.fetch as FetchFn,
      })

      expect(client).toBeInstanceOf(EdgarClient)
    })
  })
})
