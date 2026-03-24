// CompanyService tests — company metadata extraction from SEC Submissions API

import { describe, expect, it, vi } from "vitest"
import { CompanyService } from "@/company/service"
import { ValidationError } from "@/errors"
import type { SecHttpClient } from "@/http"

type MockHttpResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

function createMockSubmissionsResponse(overrides: Record<string, unknown> = {}) {
  return {
    cik: "0000320193",
    name: "Apple Inc.",
    tickers: ["AAPL"],
    exchanges: ["Nasdaq"],
    entityType: "operating",
    sic: "3571",
    sicDescription: "Electronic Computers",
    stateOfIncorporation: "CA",
    fiscalYearEnd: "0930",
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
    ...overrides,
  }
}

function createMockHttpClient(response: unknown): SecHttpClient {
  const mockResponse: MockHttpResponse = {
    ok: true,
    status: 200,
    json: async () => response,
  }

  return {
    request: vi.fn().mockResolvedValue(mockResponse),
  } as unknown as SecHttpClient
}

describe("CompanyService", () => {
  describe("getCompanyInfo", () => {
    it("should return company metadata for a valid CIK", async () => {
      const response = createMockSubmissionsResponse()
      const httpClient = createMockHttpClient(response)
      const service = new CompanyService(httpClient)

      const info = await service.getCompanyInfo("320193")

      expect(info).toEqual({
        cik: "0000320193",
        name: "Apple Inc.",
        tickers: ["AAPL"],
        exchanges: ["Nasdaq"],
        entityType: "operating",
        sic: "3571",
        sicDescription: "Electronic Computers",
        stateOfIncorporation: "CA",
        fiscalYearEnd: "0930",
      })
    })

    it("should normalize CIK to 10-digit zero-padded format", async () => {
      const response = createMockSubmissionsResponse({ cik: "320193" })
      const httpClient = createMockHttpClient(response)
      const service = new CompanyService(httpClient)

      const info = await service.getCompanyInfo("320193")

      expect(info.cik).toBe("0000320193")
    })

    it("should fetch the correct SEC submissions URL", async () => {
      const response = createMockSubmissionsResponse()
      const httpClient = createMockHttpClient(response)
      const service = new CompanyService(httpClient)

      await service.getCompanyInfo("320193")

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/submissions/CIK0000320193.json",
        { context: { operation: "getCompanyInfo", endpointClass: "submissions" } },
      )
    })

    it("should handle missing optional fields", async () => {
      const response = createMockSubmissionsResponse({
        tickers: undefined,
        exchanges: undefined,
        entityType: undefined,
        sic: undefined,
        sicDescription: undefined,
        stateOfIncorporation: undefined,
        fiscalYearEnd: undefined,
      })
      const httpClient = createMockHttpClient(response)
      const service = new CompanyService(httpClient)

      const info = await service.getCompanyInfo("320193")

      expect(info.cik).toBe("0000320193")
      expect(info.name).toBe("Apple Inc.")
      expect(info.tickers).toEqual([])
      expect(info.exchanges).toEqual([])
      expect(info.entityType).toBeUndefined()
      expect(info.sic).toBeUndefined()
      expect(info.sicDescription).toBeUndefined()
      expect(info.stateOfIncorporation).toBeUndefined()
      expect(info.fiscalYearEnd).toBeUndefined()
    })

    it("should throw ValidationError for invalid CIK", async () => {
      const service = new CompanyService({} as SecHttpClient)

      await expect(service.getCompanyInfo("abc")).rejects.toThrow(ValidationError)
    })

    it("should throw ParseError when JSON parsing fails", async () => {
      const mockResponse = {
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token")
        },
      }

      const httpClient = {
        request: vi.fn().mockResolvedValue(mockResponse),
      } as unknown as SecHttpClient

      const service = new CompanyService(httpClient)

      await expect(service.getCompanyInfo("320193")).rejects.toThrow(
        "Failed to parse submissions JSON",
      )
    })
  })
})
