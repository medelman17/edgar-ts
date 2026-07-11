// EFTS full-text search tests

import { describe, expect, it, vi } from "vitest"
import type { SecHttpClient } from "@/http"
import { SearchService } from "@/search/service"

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
  query: { q: "non-compete agreement" },
  hits: {
    total: { value: 2, relation: "eq" },
    hits: [
      {
        _id: "0001193125-24-100001:filing-main.htm",
        _source: {
          file_date: "2024-06-15",
          display_names: ["Apple Inc.  (AAPL)  (CIK 0000320193)"],
          ciks: ["0000320193"],
          file_num: ["001-36743"],
          form: "10-K",
          root_forms: ["10-K"],
          file_type: "10-K",
          file_description: "Annual report",
          period_ending: "2024-09-30",
          adsh: "0001193125-24-100001",
        },
        _score: 12.5,
      },
      {
        _id: "0001193125-24-200001:exhibit10-1.htm",
        _source: {
          file_date: "2024-03-15",
          display_names: [
            "MICROSOFT CORP  (MSFT)  (CIK 0000789019)",
            "Activision Blizzard, Inc.  (CIK 0000718877)",
          ],
          ciks: ["0000789019", "0000718877"],
          file_num: ["001-14278"],
          form: "8-K",
          root_forms: ["8-K"],
          file_type: "EX-10.1",
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
      expect(result.totalRelation).toBe("eq")
      expect(result.hits).toHaveLength(2)
      expect(result.hits[0]?.entityName).toBe("Apple Inc.  (AAPL)  (CIK 0000320193)")
      expect(result.hits[0]?.formType).toBe("10-K")
    })

    it("should pass through the matched sub-document identity and filer arrays", async () => {
      const httpClient = createMockHttpClient(SAMPLE_SEARCH_RESPONSE)
      const service = new SearchService(httpClient)

      const result = await service.searchFilings({ q: "non-compete agreement" })

      const exhibitHit = result.hits[1]
      expect(exhibitHit?.accessionNo).toBe("0001193125-24-200001")
      expect(exhibitHit?.filename).toBe("exhibit10-1.htm")
      expect(exhibitHit?.fileType).toBe("EX-10.1")
      expect(exhibitHit?.ciks).toEqual(["0000789019", "0000718877"])
      expect(exhibitHit?.displayNames).toEqual([
        "MICROSOFT CORP  (MSFT)  (CIK 0000789019)",
        "Activision Blizzard, Inc.  (CIK 0000718877)",
      ])
    })

    it("should fall back to the _id prefix for accessionNo when adsh is absent", async () => {
      const response = {
        hits: {
          total: { value: 1, relation: "eq" },
          hits: [
            {
              _id: "0001193125-24-300001:doc.htm",
              _source: { form: "S-4", file_date: "2024-05-01" },
              _score: 1.0,
            },
          ],
        },
      }
      const httpClient = createMockHttpClient(response)
      const service = new SearchService(httpClient)

      const result = await service.searchFilings({ q: "test" })

      expect(result.hits[0]?.accessionNo).toBe("0001193125-24-300001")
      expect(result.hits[0]?.filename).toBe("doc.htm")
      expect(result.hits[0]?.ciks).toEqual([])
      expect(result.hits[0]?.displayNames).toEqual([])
      expect(result.hits[0]?.fileType).toBeUndefined()
    })

    it("should surface the saturated-total relation as gte", async () => {
      const response = {
        hits: { total: { value: 10000, relation: "gte" }, hits: [] },
      }
      const httpClient = createMockHttpClient(response)
      const service = new SearchService(httpClient)

      const result = await service.searchFilings({ q: "common phrase" })

      expect(result.total).toBe(10000)
      expect(result.totalRelation).toBe("gte")
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

      expect(httpClient.request).toHaveBeenCalledWith(expect.any(String), {
        context: { operation: "searchFilings", endpointClass: "efts" },
      })
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
