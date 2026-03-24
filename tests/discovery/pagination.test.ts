// Tests for SEC Submissions API pagination

import { beforeEach, describe, expect, it, vi } from "vitest"
import { fetchAllFilings } from "@/discovery/pagination"
import type { FilingRecord, SubmissionsResponse } from "@/discovery/types"
import { TransportError, ValidationError } from "@/errors"
import type { SecHttpClient } from "@/http"

// Mock HTTP response type
type MockHttpResponse = {
  json: () => Promise<unknown>
  ok: boolean
  status: number
}

// Mock SecHttpClient
const createMockHttpClient = (): SecHttpClient => {
  return {
    request: vi.fn(),
  } as unknown as SecHttpClient
}

// Helper to create mock parallel arrays from filing records
const createParallelArrays = (filings: Array<Partial<FilingRecord>>) => {
  return {
    accessionNumber: filings.map((f) => f.accessionNumber ?? "0001193125-20-123456"),
    filingDate: filings.map((f) => f.filingDate ?? "2020-05-01"),
    reportDate: filings.map((f) => f.reportDate ?? "2020-03-31"),
    acceptanceDateTime: filings.map((f) => f.acceptanceDateTime ?? "2020-05-01T16:30:00.000Z"),
    act: filings.map((f) => f.act ?? "34"),
    form: filings.map((f) => f.form ?? "10-K"),
    fileNumber: filings.map((f) => f.fileNumber ?? "001-00001"),
    primaryDocument: filings.map((f) => f.primaryDocument ?? "filing.htm"),
    primaryDocDescription: filings.map((f) => f.primaryDocDescription ?? "10-K - Annual Report"),
    size: filings.map((f) => f.size ?? 1024),
    isXBRL: filings.map((f) => f.isXBRL ?? 1),
    isInlineXBRL: filings.map((f) => f.isInlineXBRL ?? 0),
  }
}

// Helper to create a mock submissions response
const createMockSubmissionsResponse = (
  recentFilings: Array<Partial<FilingRecord>>,
  files: Array<{ name: string; filingCount: number }> = [],
): SubmissionsResponse => ({
  cik: "0000320193",
  name: "Apple Inc.",
  tickers: ["AAPL"],
  filings: {
    recent: createParallelArrays(recentFilings),
    files,
  },
})

describe("fetchAllFilings", () => {
  let httpClient: SecHttpClient

  beforeEach(() => {
    httpClient = createMockHttpClient()
  })

  describe("CIK normalization", () => {
    it("normalizes unpadded CIK to 10 digits", async () => {
      const mockResponse = createMockSubmissionsResponse([{}])

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      await fetchAllFilings("320193", httpClient, {
        operation: "discoverFilings",
        endpointClass: "submissions",
      })

      // Verify normalized CIK used in URL
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/submissions/CIK0000320193.json",
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "discoverFilings",
            endpointClass: "submissions",
          }),
        }),
      )
    })

    it("normalizes already-padded CIK", async () => {
      const mockResponse = createMockSubmissionsResponse([{}])

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      await fetchAllFilings("0000320193", httpClient, {
        operation: "discoverFilings",
        endpointClass: "submissions",
      })

      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/submissions/CIK0000320193.json",
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "discoverFilings",
            endpointClass: "submissions",
          }),
        }),
      )
    })

    it("rejects invalid CIK format", async () => {
      await expect(fetchAllFilings("INVALID", httpClient)).rejects.toThrow(ValidationError)
      await expect(fetchAllFilings("INVALID", httpClient)).rejects.toThrow(
        "must contain only digits",
      )
    })

    it("rejects CIK exceeding 10 digits", async () => {
      await expect(fetchAllFilings("99999999999", httpClient)).rejects.toThrow(ValidationError)
      await expect(fetchAllFilings("99999999999", httpClient)).rejects.toThrow(
        "exceeds maximum 10-digit value",
      )
    })
  })

  describe("small CIK (no pagination)", () => {
    it("returns filings from recent array when files is empty", async () => {
      const filings = [
        { accessionNumber: "0001193125-20-111111", form: "10-K" },
        { accessionNumber: "0001193125-20-222222", form: "10-Q" },
        { accessionNumber: "0001193125-20-333333", form: "8-K" },
      ]

      const mockResponse = createMockSubmissionsResponse(filings, [])

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient)

      expect(result).toHaveLength(3)
      expect(result[0].accessionNumber).toBe("0001193125-20-111111")
      expect(result[1].accessionNumber).toBe("0001193125-20-222222")
      expect(result[2].accessionNumber).toBe("0001193125-20-333333")
    })

    it("returns exactly 10 filings for small CIK", async () => {
      const filings = Array.from({ length: 10 }, (_, i) => ({
        accessionNumber: `0001193125-20-${String(i).padStart(6, "0")}`,
      }))

      const mockResponse = createMockSubmissionsResponse(filings, [])

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient)

      expect(result).toHaveLength(10)
    })
  })

  describe("large CIK (with pagination)", () => {
    it("fetches and combines filings from paginated files", async () => {
      // Recent filings (1000 items)
      const recentFilings = Array.from({ length: 1000 }, (_, i) => ({
        accessionNumber: `0001193125-24-${String(i).padStart(6, "0")}`,
        filingDate: "2024-01-01",
      }))

      // Paginated files
      const paginatedFiles = [
        { name: "CIK0000320193-submissions-001.json", filingCount: 500 },
        { name: "CIK0000320193-submissions-002.json", filingCount: 500 },
      ]

      const mockPrimaryResponse = createMockSubmissionsResponse(recentFilings, paginatedFiles)

      // Paginated file 1 data (parallel arrays format)
      const paginatedFile1Data = {
        accessionNumber: Array.from(
          { length: 500 },
          (_, i) => `0001193125-23-${String(i).padStart(6, "0")}`,
        ),
        filingDate: Array.from({ length: 500 }, () => "2023-01-01"),
        reportDate: Array.from({ length: 500 }, () => "2022-12-31"),
        acceptanceDateTime: Array.from({ length: 500 }, () => "2023-01-01T16:00:00.000Z"),
        act: Array.from({ length: 500 }, () => "34"),
        form: Array.from({ length: 500 }, () => "10-Q"),
        fileNumber: Array.from({ length: 500 }, () => "001-00001"),
        primaryDocument: Array.from({ length: 500 }, () => "filing.htm"),
        primaryDocDescription: Array.from({ length: 500 }, () => "Quarterly Report"),
        size: Array.from({ length: 500 }, () => 2048),
        isXBRL: Array.from({ length: 500 }, () => 1),
        isInlineXBRL: Array.from({ length: 500 }, () => 1),
      }

      // Paginated file 2 data
      const paginatedFile2Data = {
        accessionNumber: Array.from(
          { length: 500 },
          (_, i) => `0001193125-22-${String(i).padStart(6, "0")}`,
        ),
        filingDate: Array.from({ length: 500 }, () => "2022-01-01"),
        reportDate: Array.from({ length: 500 }, () => "2021-12-31"),
        acceptanceDateTime: Array.from({ length: 500 }, () => "2022-01-01T16:00:00.000Z"),
        act: Array.from({ length: 500 }, () => "34"),
        form: Array.from({ length: 500 }, () => "8-K"),
        fileNumber: Array.from({ length: 500 }, () => "001-00001"),
        primaryDocument: Array.from({ length: 500 }, () => "filing.htm"),
        primaryDocDescription: Array.from({ length: 500 }, () => "Current Report"),
        size: Array.from({ length: 500 }, () => 1024),
        isXBRL: Array.from({ length: 500 }, () => 0),
        isInlineXBRL: Array.from({ length: 500 }, () => 0),
      }

      // Mock HTTP responses
      vi.mocked(httpClient.request)
        .mockResolvedValueOnce({
          json: async () => mockPrimaryResponse,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockResolvedValueOnce({
          json: async () => paginatedFile1Data,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockResolvedValueOnce({
          json: async () => paginatedFile2Data,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient, {
        operation: "discoverFilings",
        endpointClass: "submissions",
      })

      // Verify total count: 1000 (recent) + 500 (file1) + 500 (file2) = 2000
      expect(result).toHaveLength(2000)

      // Verify primary request
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/submissions/CIK0000320193.json",
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "discoverFilings",
            endpointClass: "submissions",
          }),
        }),
      )

      // Verify paginated file requests use data.sec.gov base
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/submissions/CIK0000320193-submissions-001.json",
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "discoverFilings",
            endpointClass: "submissions",
          }),
        }),
      )
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://data.sec.gov/submissions/CIK0000320193-submissions-002.json",
        expect.objectContaining({
          context: expect.objectContaining({
            operation: "discoverFilings",
            endpointClass: "submissions",
          }),
        }),
      )

      // Verify filings from different sources are included
      expect(result.filter((f: FilingRecord) => f.filingDate === "2024-01-01")).toHaveLength(1000) // recent
      expect(result.filter((f: FilingRecord) => f.filingDate === "2023-01-01")).toHaveLength(500) // file 1
      expect(result.filter((f: FilingRecord) => f.filingDate === "2022-01-01")).toHaveLength(500) // file 2
    })

    it("handles single paginated file", async () => {
      const recentFilings = Array.from({ length: 1000 }, (_, i) => ({
        accessionNumber: `0001193125-24-${String(i).padStart(6, "0")}`,
      }))

      const paginatedFiles = [{ name: "CIK0000320193-submissions-001.json", filingCount: 200 }]

      const mockPrimaryResponse = createMockSubmissionsResponse(recentFilings, paginatedFiles)

      const paginatedFileData = {
        accessionNumber: Array.from(
          { length: 200 },
          (_, i) => `0001193125-23-${String(i).padStart(6, "0")}`,
        ),
        filingDate: Array.from({ length: 200 }, () => "2023-01-01"),
        reportDate: Array.from({ length: 200 }, () => "2022-12-31"),
        acceptanceDateTime: Array.from({ length: 200 }, () => "2023-01-01T16:00:00.000Z"),
        act: Array.from({ length: 200 }, () => "34"),
        form: Array.from({ length: 200 }, () => "10-Q"),
        fileNumber: Array.from({ length: 200 }, () => "001-00001"),
        primaryDocument: Array.from({ length: 200 }, () => "filing.htm"),
        primaryDocDescription: Array.from({ length: 200 }, () => ""),
        size: Array.from({ length: 200 }, () => 1024),
        isXBRL: Array.from({ length: 200 }, () => 1),
        isInlineXBRL: Array.from({ length: 200 }, () => 1),
      }

      vi.mocked(httpClient.request)
        .mockResolvedValueOnce({
          json: async () => mockPrimaryResponse,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockResolvedValueOnce({
          json: async () => paginatedFileData,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient)

      expect(result).toHaveLength(1200) // 1000 + 200
    })
  })

  describe("empty filings", () => {
    it("returns empty array when recent is empty and no files", async () => {
      const mockResponse = createMockSubmissionsResponse([], [])

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient)

      expect(result).toHaveLength(0)
      expect(result).toEqual([])
    })

    it("handles missing recent array gracefully", async () => {
      const mockResponse = {
        cik: "0000320193",
        name: "Test Company",
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
      }

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient)

      expect(result).toHaveLength(0)
    })

    it("handles missing files array gracefully", async () => {
      const filings = [{}]
      const mockResponse = {
        cik: "0000320193",
        name: "Test Company",
        filings: {
          recent: createParallelArrays(filings),
          files: undefined as unknown,
        },
      }

      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => mockResponse,
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      const result = await fetchAllFilings("0000320193", httpClient)

      expect(result).toHaveLength(1)
    })
  })

  describe("pagination URL construction", () => {
    it("uses data.sec.gov base for paginated files", async () => {
      const recentFilings = [{}]
      const paginatedFiles = [{ name: "CIK0000320193-submissions-001.json", filingCount: 100 }]

      const mockPrimaryResponse = createMockSubmissionsResponse(recentFilings, paginatedFiles)

      const paginatedFileData = {
        accessionNumber: ["0001193125-23-000001"],
        filingDate: ["2023-01-01"],
        reportDate: ["2022-12-31"],
        acceptanceDateTime: ["2023-01-01T16:00:00.000Z"],
        act: ["34"],
        form: ["10-K"],
        fileNumber: ["001-00001"],
        primaryDocument: ["filing.htm"],
        primaryDocDescription: [""],
        size: [1024],
        isXBRL: [1],
        isInlineXBRL: [0],
      }

      vi.mocked(httpClient.request)
        .mockResolvedValueOnce({
          json: async () => mockPrimaryResponse,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockResolvedValueOnce({
          json: async () => paginatedFileData,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)

      await fetchAllFilings("0000320193", httpClient)

      // Verify paginated URL uses data.sec.gov/submissions/ base
      const calls = vi.mocked(httpClient.request).mock.calls
      expect(calls[1][0]).toBe(
        "https://data.sec.gov/submissions/CIK0000320193-submissions-001.json",
      )
    })
  })

  describe("error handling", () => {
    it("propagates HTTP errors from primary request", async () => {
      const transportError = new TransportError("Network error", true)

      vi.mocked(httpClient.request).mockRejectedValueOnce(transportError)

      await expect(fetchAllFilings("0000320193", httpClient)).rejects.toThrow(
        expect.objectContaining({
          name: "TransportError",
          message: expect.stringContaining("Network error"),
        }),
      )
    })

    it("propagates HTTP errors from paginated file requests", async () => {
      const recentFilings = [{}]
      const paginatedFiles = [{ name: "CIK0000320193-submissions-001.json", filingCount: 100 }]

      const mockPrimaryResponse = createMockSubmissionsResponse(recentFilings, paginatedFiles)

      const transportError = new TransportError("Paginated file not found", false)

      vi.mocked(httpClient.request)
        .mockResolvedValueOnce({
          json: async () => mockPrimaryResponse,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockRejectedValueOnce(transportError)

      await expect(fetchAllFilings("0000320193", httpClient)).rejects.toThrow(
        expect.objectContaining({
          name: "TransportError",
          message: expect.stringContaining("Paginated file not found"),
        }),
      )
    })

    it("throws ParseError on invalid JSON from primary response", async () => {
      vi.mocked(httpClient.request).mockResolvedValueOnce({
        json: async () => {
          throw new Error("Invalid JSON")
        },
        ok: true,
        status: 200,
      } as unknown as MockHttpResponse)

      await expect(fetchAllFilings("0000320193", httpClient)).rejects.toThrow(
        expect.objectContaining({
          name: "ParseError",
          message: expect.stringContaining("Failed to parse JSON from"),
        }),
      )
    })

    it("throws ParseError on invalid JSON from paginated file", async () => {
      const recentFilings = [{}]
      const paginatedFiles = [{ name: "CIK0000320193-submissions-001.json", filingCount: 100 }]

      const mockPrimaryResponse = createMockSubmissionsResponse(recentFilings, paginatedFiles)

      vi.mocked(httpClient.request)
        .mockResolvedValueOnce({
          json: async () => mockPrimaryResponse,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockResolvedValueOnce({
          json: async () => {
            throw new Error("Invalid JSON")
          },
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)

      await expect(fetchAllFilings("0000320193", httpClient)).rejects.toThrow(
        expect.objectContaining({
          name: "ParseError",
          message: expect.stringContaining("Failed to parse paginated filings JSON"),
        }),
      )
    })
  })

  describe("all requests route through SecHttpClient", () => {
    it("uses httpClient for all HTTP requests", async () => {
      const recentFilings = [{}]
      const paginatedFiles = [{ name: "CIK0000320193-submissions-001.json", filingCount: 1 }]

      const mockPrimaryResponse = createMockSubmissionsResponse(recentFilings, paginatedFiles)

      const paginatedFileData = {
        accessionNumber: ["0001193125-23-000001"],
        filingDate: ["2023-01-01"],
        reportDate: ["2022-12-31"],
        acceptanceDateTime: ["2023-01-01T16:00:00.000Z"],
        act: ["34"],
        form: ["10-K"],
        fileNumber: ["001-00001"],
        primaryDocument: ["filing.htm"],
        primaryDocDescription: [""],
        size: [1024],
        isXBRL: [1],
        isInlineXBRL: [0],
      }

      vi.mocked(httpClient.request)
        .mockResolvedValueOnce({
          json: async () => mockPrimaryResponse,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)
        .mockResolvedValueOnce({
          json: async () => paginatedFileData,
          ok: true,
          status: 200,
        } as unknown as MockHttpResponse)

      await fetchAllFilings("0000320193", httpClient)

      // Verify httpClient.request was called for both primary and paginated requests
      expect(httpClient.request).toHaveBeenCalledTimes(2)

      // Verify no direct fetch() calls were made (all went through httpClient)
      // This is implicit in the test structure, but the key is that we're mocking
      // httpClient.request, not global fetch
    })
  })
})
