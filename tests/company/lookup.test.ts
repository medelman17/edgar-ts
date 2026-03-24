// Company/Ticker Lookup tests

import { describe, expect, it, vi } from "vitest"
import { CompanyService } from "@/company/service"
import type { SecHttpClient } from "@/http"

/**
 * The SEC's company_tickers_exchange.json format:
 * { fields: ["cik", "name", "ticker", "exchange"], data: [[cik, name, ticker, exchange], ...] }
 */
function createMockTickersResponse() {
  return {
    fields: ["cik", "name", "ticker", "exchange"],
    data: [
      [320193, "Apple Inc.", "AAPL", "Nasdaq"],
      [789019, "MICROSOFT CORP", "MSFT", "Nasdaq"],
      [1018724, "AMAZON COM INC", "AMZN", "Nasdaq"],
      [1652044, "Alphabet Inc.", "GOOGL", "Nasdaq"],
      [1652044, "Alphabet Inc.", "GOOG", "Nasdaq"],
      [51143, "INTERNATIONAL BUSINESS MACHINES CORP", "IBM", "NYSE"],
    ],
  }
}

function createMockHttpClient(response: unknown): SecHttpClient {
  return {
    request: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    }),
  } as unknown as SecHttpClient
}

describe("CompanyService.lookupCompany", () => {
  describe("ticker matching", () => {
    it("should find a company by exact ticker (case-insensitive)", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const results = await service.lookupCompany("aapl")

      expect(results).toHaveLength(1)
      expect(results[0]).toEqual({
        cik: "0000320193",
        ticker: "AAPL",
        name: "Apple Inc.",
        exchange: "Nasdaq",
      })
    })

    it("should return multiple results for companies with multiple tickers", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const googl = await service.lookupCompany("GOOGL")
      const goog = await service.lookupCompany("GOOG")

      expect(googl).toHaveLength(1)
      expect(goog).toHaveLength(1)
      expect(googl[0]?.cik).toBe("0001652044")
      expect(goog[0]?.cik).toBe("0001652044")
    })

    it("should return empty array for non-existent ticker", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const results = await service.lookupCompany("ZZZZ")

      expect(results).toEqual([])
    })
  })

  describe("name matching", () => {
    it("should find companies by name substring (case-insensitive)", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const results = await service.lookupCompany("apple")

      expect(results).toHaveLength(1)
      expect(results[0]?.ticker).toBe("AAPL")
    })

    it("should match partial company names", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const results = await service.lookupCompany("INTERNATIONAL BUSINESS")

      expect(results).toHaveLength(1)
      expect(results[0]?.ticker).toBe("IBM")
    })

    it("should return multiple matches for ambiguous names", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const results = await service.lookupCompany("Inc")

      // Apple Inc., Alphabet Inc. (GOOGL and GOOG entries)
      expect(results.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe("CIK normalization", () => {
    it("should normalize CIK to 10-digit zero-padded format", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      const results = await service.lookupCompany("AAPL")

      expect(results[0]?.cik).toBe("0000320193")
    })
  })

  describe("HTTP behavior", () => {
    it("should fetch the correct SEC URL", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      await service.lookupCompany("AAPL")

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/files/company_tickers_exchange.json",
        { context: { operation: "lookupCompany", endpointClass: "files" } },
      )
    })
  })

  describe("priority", () => {
    it("should prioritize exact ticker matches over name matches", async () => {
      const httpClient = createMockHttpClient(createMockTickersResponse())
      const service = new CompanyService(httpClient)

      // "IBM" is both a ticker and appears in the company name
      const results = await service.lookupCompany("IBM")

      // Ticker match should come first
      expect(results[0]?.ticker).toBe("IBM")
    })
  })
})
