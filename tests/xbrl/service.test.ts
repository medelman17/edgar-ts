// XBRL API wrapping tests

import { describe, expect, it, vi } from "vitest"
import type { SecHttpClient } from "@/http"
import { XbrlService } from "@/xbrl/service"

function createMockHttpClient(response: unknown): SecHttpClient {
  return {
    request: vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => response,
    }),
  } as unknown as SecHttpClient
}

describe("XbrlService", () => {
  describe("getCompanyFacts", () => {
    it("should return typed company facts for a CIK", async () => {
      const mockResponse = {
        cik: 320193,
        entityName: "Apple Inc.",
        facts: {
          "us-gaap": {
            Revenue: {
              label: "Revenue",
              description: "Total revenue",
              units: {
                USD: [
                  {
                    val: 394328000000,
                    accn: "0000320193-23-000106",
                    fy: 2023,
                    fp: "FY",
                    form: "10-K",
                    filed: "2023-11-03",
                  },
                ],
              },
            },
          },
        },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new XbrlService(httpClient)

      const result = await service.getCompanyFacts("320193")

      expect(result.cik).toBe(320193)
      expect(result.entityName).toBe("Apple Inc.")
      expect(result.facts["us-gaap"]).toBeDefined()
    })

    it("should fetch the correct SEC XBRL URL", async () => {
      const httpClient = createMockHttpClient({ cik: 320193, entityName: "Apple", facts: {} })
      const service = new XbrlService(httpClient)

      await service.getCompanyFacts("320193")

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json",
        { context: { operation: "getCompanyFacts", endpointClass: "xbrl" } },
      )
    })

    it("should normalize CIK to 10-digit format", async () => {
      const httpClient = createMockHttpClient({ cik: 320193, entityName: "Apple", facts: {} })
      const service = new XbrlService(httpClient)

      await service.getCompanyFacts("320193")

      const calledUrl = (httpClient.request as ReturnType<typeof vi.fn>).mock.calls[0][0]
      expect(calledUrl).toContain("CIK0000320193")
    })
  })

  describe("getCompanyConcept", () => {
    it("should return time-series data for a concept", async () => {
      const mockResponse = {
        cik: 320193,
        taxonomy: "us-gaap",
        tag: "Revenue",
        label: "Revenue",
        entityName: "Apple Inc.",
        units: {
          USD: [
            {
              val: 394328000000,
              accn: "0000320193-23-000106",
              fy: 2023,
              fp: "FY",
              form: "10-K",
              filed: "2023-11-03",
              start: "2022-10-02",
              end: "2023-09-30",
            },
            {
              val: 365817000000,
              accn: "0000320193-22-000108",
              fy: 2022,
              fp: "FY",
              form: "10-K",
              filed: "2022-10-28",
              start: "2021-09-26",
              end: "2022-09-24",
            },
          ],
        },
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new XbrlService(httpClient)

      const result = await service.getCompanyConcept("320193", "us-gaap", "Revenue")

      expect(result.taxonomy).toBe("us-gaap")
      expect(result.tag).toBe("Revenue")
      expect(result.units.USD).toHaveLength(2)
    })

    it("should fetch the correct concept URL", async () => {
      const httpClient = createMockHttpClient({
        cik: 320193,
        taxonomy: "us-gaap",
        tag: "Revenue",
        units: {},
      })
      const service = new XbrlService(httpClient)

      await service.getCompanyConcept("320193", "us-gaap", "Revenue")

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/api/xbrl/companyconcept/CIK0000320193/us-gaap/Revenue.json",
        { context: { operation: "getCompanyConcept", endpointClass: "xbrl" } },
      )
    })
  })

  describe("getFrame", () => {
    it("should return cross-company data for a concept at a point in time", async () => {
      const mockResponse = {
        taxonomy: "us-gaap",
        tag: "Revenue",
        ccp: "CY2023",
        uom: "USD",
        label: "Revenue",
        pts: 4500,
        data: [
          {
            accn: "0000320193-23-000106",
            cik: 320193,
            entityName: "Apple Inc.",
            val: 394328000000,
          },
          {
            accn: "0000789019-23-000100",
            cik: 789019,
            entityName: "MICROSOFT CORP",
            val: 211915000000,
          },
        ],
      }

      const httpClient = createMockHttpClient(mockResponse)
      const service = new XbrlService(httpClient)

      const result = await service.getFrame("us-gaap", "Revenue", "USD", "CY2023")

      expect(result.taxonomy).toBe("us-gaap")
      expect(result.data).toHaveLength(2)
    })

    it("should fetch the correct frame URL", async () => {
      const httpClient = createMockHttpClient({ taxonomy: "us-gaap", tag: "Revenue", data: [] })
      const service = new XbrlService(httpClient)

      await service.getFrame("us-gaap", "Revenue", "USD", "CY2023Q1")

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/api/xbrl/frames/us-gaap/Revenue/USD/CY2023Q1.json",
        { context: { operation: "getFrame", endpointClass: "xbrl" } },
      )
    })
  })
})
