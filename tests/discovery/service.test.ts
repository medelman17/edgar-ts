// DiscoveryService integration tests

import { ConfigurationError, ValidationError } from "@/errors"
import type { SecHttpClient } from "@/http"
import { DiscoveryService } from "@/discovery/service"
import type { FilingRecord, SubmissionsResponse } from "@/discovery/types"
import { describe, expect, it, vi } from "vitest"

// Mock HTTP response type (SecHttpClient returns HttpResponse without json method)
type MockHttpResponse = {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

/**
 * Create a mock SubmissionsResponse with specified filings
 */
function createMockSubmissionsResponse(filings: FilingRecord[]): SubmissionsResponse {
  return {
    cik: "0000320193",
    name: "Apple Inc.",
    filings: {
      recent: filings,
      files: [],
    },
  }
}

/**
 * Create mock HTTP client that returns specified response
 */
function createMockHttpClient(response: SubmissionsResponse): SecHttpClient {
  const mockResponse: MockHttpResponse = {
    ok: true,
    status: 200,
    json: async () => response,
  }

  return {
    request: vi.fn().mockResolvedValue(mockResponse),
  } as unknown as SecHttpClient
}

describe("DiscoveryService", () => {
  describe("input validation", () => {
    it("should throw ValidationError for invalid 'from' date format", async () => {
      const service = new DiscoveryService({} as SecHttpClient)

      await expect(
        service.discoverFilings({
          cik: "320193",
          from: "2024-01-32", // Invalid day
          to: "2024-12-31",
        }),
      ).rejects.toThrow(ValidationError)
    })

    it("should throw ValidationError for invalid 'to' date format", async () => {
      const service = new DiscoveryService({} as SecHttpClient)

      await expect(
        service.discoverFilings({
          cik: "320193",
          from: "2024-01-01",
          to: "2024-13-31", // Invalid month
        }),
      ).rejects.toThrow(ValidationError)
    })

    it("should throw ValidationError when 'from' > 'to'", async () => {
      const service = new DiscoveryService({} as SecHttpClient)

      await expect(
        service.discoverFilings({
          cik: "320193",
          from: "2024-12-31",
          to: "2024-01-01", // Reversed
        }),
      ).rejects.toThrow(ValidationError)

      try {
        await service.discoverFilings({
          cik: "320193",
          from: "2024-12-31",
          to: "2024-01-01",
        })
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).message).toContain("from")
        expect((error as ValidationError).message).toContain("to")
      }
    })

    it("should throw ConfigurationError when CIK not provided", async () => {
      const service = new DiscoveryService({} as SecHttpClient)

      await expect(
        service.discoverFilings({
          from: "2024-01-01",
          to: "2024-12-31",
          // No CIK
        }),
      ).rejects.toThrow(ConfigurationError)

      try {
        await service.discoverFilings({
          from: "2024-01-01",
          to: "2024-12-31",
        })
      } catch (error) {
        expect(error).toBeInstanceOf(ConfigurationError)
        expect((error as ConfigurationError).message).toContain("Daily Index")
      }
    })
  })

  describe("date range filtering", () => {
    it("should filter filings within date range", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-23-123456",
          filingDate: "2023-12-31", // Before range
          reportDate: "2023-12-31",
          acceptanceDateTime: "2023-12-31T16:00:00Z",
          act: "34",
          form: "10-K",
          fileNumber: "001-36743",
          primaryDocument: "aapl-10k_20231231.htm",
          size: 1000000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-24-123456",
          filingDate: "2024-03-15", // Within range
          reportDate: "2024-03-15",
          acceptanceDateTime: "2024-03-15T16:00:00Z",
          act: "34",
          form: "10-Q",
          fileNumber: "001-36743",
          primaryDocument: "aapl-10q_20240315.htm",
          size: 500000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-24-789012",
          filingDate: "2024-06-30", // Within range
          reportDate: "2024-06-30",
          acceptanceDateTime: "2024-06-30T16:00:00Z",
          act: "34",
          form: "10-Q",
          fileNumber: "001-36743",
          primaryDocument: "aapl-10q_20240630.htm",
          size: 550000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-25-123456",
          filingDate: "2025-01-15", // After range
          reportDate: "2025-01-15",
          acceptanceDateTime: "2025-01-15T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "aapl-8k_20250115.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Should only include 2 filings within 2024
      expect(result).toHaveLength(2)
      expect(result[0]?.filingDate).toBe("2024-03-15")
      expect(result[1]?.filingDate).toBe("2024-06-30")
    })

    it("should include boundary dates (inclusive range)", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-01-01", // Exact 'from'
          reportDate: "2024-01-01",
          acceptanceDateTime: "2024-01-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test1.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
        {
          accessionNumber: "0001193125-24-100002",
          filingDate: "2024-12-31", // Exact 'to'
          reportDate: "2024-12-31",
          acceptanceDateTime: "2024-12-31T16:00:00Z",
          act: "34",
          form: "10-K",
          fileNumber: "001-36743",
          primaryDocument: "test2.htm",
          size: 1000000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Both boundary dates should be included
      expect(result).toHaveLength(2)
    })
  })

  describe("form type filtering", () => {
    it("should use default form types when not specified", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "10-K", // In defaults
          fileNumber: "001-36743",
          primaryDocument: "test1.htm",
          size: 1000000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-24-100002",
          filingDate: "2024-06-02",
          reportDate: "2024-06-02",
          acceptanceDateTime: "2024-06-02T16:00:00Z",
          act: "34",
          form: "DEF 14A", // NOT in defaults
          fileNumber: "001-36743",
          primaryDocument: "test2.htm",
          size: 500000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
        {
          accessionNumber: "0001193125-24-100003",
          filingDate: "2024-06-03",
          reportDate: "2024-06-03",
          acceptanceDateTime: "2024-06-03T16:00:00Z",
          act: "34",
          form: "8-K", // In defaults
          fileNumber: "001-36743",
          primaryDocument: "test3.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Should only include 10-K and 8-K (not DEF 14A)
      expect(result).toHaveLength(2)
      expect(result.map((f) => f.formType)).toContain("10-K")
      expect(result.map((f) => f.formType)).toContain("8-K")
      expect(result.map((f) => f.formType)).not.toContain("DEF 14A")
    })

    it("should respect custom form types", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "10-K",
          fileNumber: "001-36743",
          primaryDocument: "test1.htm",
          size: 1000000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-24-100002",
          filingDate: "2024-06-02",
          reportDate: "2024-06-02",
          acceptanceDateTime: "2024-06-02T16:00:00Z",
          act: "34",
          form: "DEF 14A",
          fileNumber: "001-36743",
          primaryDocument: "test2.htm",
          size: 500000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
        formTypes: ["DEF 14A"], // Custom filter
      })

      // Should only include DEF 14A
      expect(result).toHaveLength(1)
      expect(result[0]?.formType).toBe("DEF 14A")
    })

    it("should include amendments in default form types", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "10-K",
          fileNumber: "001-36743",
          primaryDocument: "test1.htm",
          size: 1000000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-24-100002",
          filingDate: "2024-06-15",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-15T16:00:00Z",
          act: "34",
          form: "10-K/A", // Amendment
          fileNumber: "001-36743",
          primaryDocument: "test2.htm",
          size: 1100000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
        // Use default form types (includes both 10-K and 10-K/A)
      })

      // Should include both original and amendment
      expect(result).toHaveLength(2)
      expect(result.map((f) => f.formType)).toContain("10-K")
      expect(result.map((f) => f.formType)).toContain("10-K/A")
    })
  })

  describe("normalization", () => {
    it("should normalize CIK to 10-digit padded format", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193", // Unpadded
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // CIK should be normalized to 10 digits
      expect(result[0]?.cik).toBe("0000320193")
    })

    it("should normalize accession numbers to canonical hyphenated format", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "000119312524100001", // Compact format
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Accession should be normalized to hyphenated format
      expect(result[0]?.accessionNo).toBe("0001193125-24-100001")
    })

    it("should normalize form types to uppercase", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "10-k", // Lowercase
          fileNumber: "001-36743",
          primaryDocument: "test.htm",
          size: 1000000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
        formTypes: ["10-K"], // Custom filter with uppercase
      })

      // Form type should be uppercase
      expect(result[0]?.formType).toBe("10-K")
    })
  })

  describe("deduplication and sorting", () => {
    it("should deduplicate filings by (cik, accessionNo) identity", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
        {
          accessionNumber: "0001193125-24-100001", // Duplicate
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Should only include one instance
      expect(result).toHaveLength(1)
    })

    it("should sort filings by filingDate asc, then accessionNo asc", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-200000",
          filingDate: "2024-09-01",
          reportDate: "2024-09-01",
          acceptanceDateTime: "2024-09-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test3.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
        {
          accessionNumber: "0001193125-24-100000",
          filingDate: "2024-03-15",
          reportDate: "2024-03-15",
          acceptanceDateTime: "2024-03-15T16:00:00Z",
          act: "34",
          form: "10-Q",
          fileNumber: "001-36743",
          primaryDocument: "test1.htm",
          size: 500000,
          isXBRL: 1,
          isInlineXBRL: 1,
        },
        {
          accessionNumber: "0001193125-24-300000",
          filingDate: "2024-03-15", // Same date as above
          reportDate: "2024-03-15",
          acceptanceDateTime: "2024-03-15T17:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test2.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Should be sorted by date first, then accession
      expect(result).toHaveLength(3)
      expect(result[0]?.filingDate).toBe("2024-03-15")
      expect(result[0]?.accessionNo).toBe("0001193125-24-100000") // Lower accession comes first
      expect(result[1]?.filingDate).toBe("2024-03-15")
      expect(result[1]?.accessionNo).toBe("0001193125-24-300000")
      expect(result[2]?.filingDate).toBe("2024-09-01")
    })
  })

  describe("filing URL generation", () => {
    it("should generate valid SEC viewer URLs", async () => {
      const mockFilings: FilingRecord[] = [
        {
          accessionNumber: "0001193125-24-100001",
          filingDate: "2024-06-01",
          reportDate: "2024-06-01",
          acceptanceDateTime: "2024-06-01T16:00:00Z",
          act: "34",
          form: "8-K",
          fileNumber: "001-36743",
          primaryDocument: "test.htm",
          size: 100000,
          isXBRL: 0,
          isInlineXBRL: 0,
        },
      ]

      const response = createMockSubmissionsResponse(mockFilings)
      const httpClient = createMockHttpClient(response)
      const service = new DiscoveryService(httpClient)

      const result = await service.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Verify URL format
      expect(result[0]?.filingUrl).toBe(
        "https://www.sec.gov/cgi-bin/viewer?action=view&cik=0000320193&accession_number=000119312524100001&xbrl_type=v",
      )
    })
  })
})
