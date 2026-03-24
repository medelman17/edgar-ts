// EFTS full-text search tests

import { describe, expect, it, vi } from "vitest"
import { SearchService } from "@/search/service"
import type { SecHttpClient } from "@/http"

function createMockHttpClient(response: unknown): SecHttpClient {
  return {
    request: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    }),
  } as unknown as SecHttpClient
}

const SAMPLE_SEARCH_RESPONSE = {
  query: { q: "non-compete agreement", dateRange: "custom", startdt: "2024-01-01", enddt: "2024-12-31" },
  hits: {
    total: { value: 2, relation: "eq" },
    hits: [
      {
        _id: "0001193125-24-100001:filing-main.htm",
        _source: {
          file_date: "2024-06-15",
          display_date_filed: "2024-06-15",
          entity_name: "Apple Inc.",
          file_num: "001-36743",
          form_type: "10-K",
          file_description: "Annual report",
          period_of_report: "2024-09-30",
        },
        _score: 12.5,
      },
      {
        _id: "0001193125-24-200001:exhibit10-1.htm",
        _source: {
          file_date: "2024-03-15",
          display_date_filed: "2024-03-15",
          entity_name: "MICROSOFT CORP",
          file_num: "001-14278",
          form_type: "8-K",
          file_description: "Current report",
        },
        _score: 8.3,
      },
    ],
  },
}

describe("SearchService", () => {
  describe("searchFilings", () => {
    it("should return search results with hits and total count", async () => {
      const httpClient = createMockHttpClient(SAMPLE_SEARCH_RESPONSE)
      const service = new SearchService(httpClient)

      const result = await service.searchFilings({ q: "non-compete agreement" })

      expect(result.total).toBe(2)
      expect(result.hits).toHaveLength(2)
      expect(result.hits[0]?.entityName).toBe("Apple Inc.")
      expect(result.hits[0]?.formType).toBe("10-K")
    })

    it("should construct correct EFTS URL with query params", async () => {
      const httpClient = createMockHttpClient(SAMPLE_SEARCH_RESPONSE)
      const service = new SearchService(httpClient)

      await service.searchFilings({
        q: "non-compete",
        formTypes: ["10-K", "8-K"],
        from: "2024-01-01",
        to: "2024-12-31",
      })

      const calledUrl = (httpClient.request as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain("efts.sec.gov/LATEST/search-index")
      expect(calledUrl).toContain("q=non-compete")
      expect(calledUrl).toContain("forms=10-K%2C8-K")
      expect(calledUrl).toContain("startdt=2024-01-01")
      expect(calledUrl).toContain("enddt=2024-12-31")
    })

    it("should use correct telemetry context", async () => {
      const httpClient = createMockHttpClient(SAMPLE_SEARCH_RESPONSE)
      const service = new SearchService(httpClient)

      await service.searchFilings({ q: "test" })

      expect(httpClient.request).toHaveBeenCalledWith(
        expect.any(String),
        { context: { operation: "searchFilings", endpointClass: "efts" } },
      )
    })

    it("should handle pagination with from parameter", async () => {
      const httpClient = createMockHttpClient(SAMPLE_SEARCH_RESPONSE)
      const service = new SearchService(httpClient)

      await service.searchFilings({ q: "test", start: 50 })

      const calledUrl = (httpClient.request as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain("from=50")
    })

    it("should handle empty results", async () => {
      const emptyResponse = {
        query: { q: "xyznonexistent" },
        hits: { total: { value: 0, relation: "eq" }, hits: [] },
      }
      const httpClient = createMockHttpClient(emptyResponse)
      const service = new SearchService(httpClient)

      const result = await service.searchFilings({ q: "xyznonexistent" })

      expect(result.total).toBe(0)
      expect(result.hits).toEqual([])
    })

    it("should support entity/CIK filter", async () => {
      const httpClient = createMockHttpClient(SAMPLE_SEARCH_RESPONSE)
      const service = new SearchService(httpClient)

      await service.searchFilings({ q: "revenue", entity: "0000320193" })

      const calledUrl = (httpClient.request as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
      expect(calledUrl).toContain("entity=0000320193")
    })
  })
})
