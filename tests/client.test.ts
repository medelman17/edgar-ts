import { beforeEach, describe, expect, it, vi } from "vitest"
import { EdgarClient, ConfigurationError } from "@/index"
import type { SubmissionsResponse } from "@/discovery/types"

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe("EdgarClient", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("constructor", () => {
    it("accepts valid options", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("rejects empty userAgent", () => {
      expect(() => new EdgarClient({ userAgent: "" })).toThrow(ConfigurationError)
    })

    it("rejects whitespace-only userAgent", () => {
      expect(() => new EdgarClient({ userAgent: "   " })).toThrow(ConfigurationError)
    })

    it("trims userAgent", () => {
      const client = new EdgarClient({
        userAgent: "  TestBot/1.0 (test@example.com)  ",
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts custom retry options", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        retries: { maxAttempts: 5, baseDelayMs: 500, maxDelayMs: 8000 },
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts custom rate limit", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        maxRequestsPerSecond: 4,
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })

    it("accepts custom timeout", () => {
      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
        timeoutMs: 30000,
      })
      expect(client).toBeInstanceOf(EdgarClient)
    })
  })

  describe("discoverFilings", () => {
    it("discovers filings by CIK and date range", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Apple Inc.",
        filings: {
          recent: [
            {
              accessionNumber: "0001193125-24-123456",
              filingDate: "2024-06-15",
              reportDate: "2024-06-15",
              acceptanceDateTime: "2024-06-15T16:00:00Z",
              act: "34",
              form: "10-Q",
              fileNumber: "001-36743",
              primaryDocument: "aapl-10q_20240615.htm",
              size: 500000,
              isXBRL: 1,
              isInlineXBRL: 1,
            },
            {
              accessionNumber: "0001193125-24-789012",
              filingDate: "2024-03-15",
              reportDate: "2024-03-15",
              acceptanceDateTime: "2024-03-15T16:00:00Z",
              act: "34",
              form: "8-K",
              fileNumber: "001-36743",
              primaryDocument: "aapl-8k_20240315.htm",
              size: 100000,
              isXBRL: 0,
              isInlineXBRL: 0,
            },
          ],
          files: [],
        },
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filings = await client.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Should return both filings, sorted by date
      expect(filings).toHaveLength(2)
      expect(filings[0]?.cik).toBe("0000320193") // CIK normalized to 10 digits
      expect(filings[0]?.filingDate).toBe("2024-03-15") // Earlier date first
      expect(filings[0]?.formType).toBe("8-K")
      expect(filings[1]?.filingDate).toBe("2024-06-15")
      expect(filings[1]?.formType).toBe("10-Q")
    })

    it("normalizes CIK to 10-digit padded format", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Apple Inc.",
        filings: {
          recent: [
            {
              accessionNumber: "0001193125-24-123456",
              filingDate: "2024-06-15",
              reportDate: "2024-06-15",
              acceptanceDateTime: "2024-06-15T16:00:00Z",
              act: "34",
              form: "10-K",
              fileNumber: "001-36743",
              primaryDocument: "test.htm",
              size: 1000000,
              isXBRL: 1,
              isInlineXBRL: 1,
            },
          ],
          files: [],
        },
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filings = await client.discoverFilings({
        cik: "320193", // Unpadded input
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // CIK should be normalized to 10 digits
      expect(filings[0]?.cik).toBe("0000320193")
    })

    it("applies deduplication and sorting", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Apple Inc.",
        filings: {
          recent: [
            {
              accessionNumber: "0001193125-24-100001",
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
              accessionNumber: "0001193125-24-100001", // Duplicate
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
              accessionNumber: "0001193125-24-100002",
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
          ],
          files: [],
        },
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filings = await client.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
      })

      // Should deduplicate (2 unique filings) and sort by date
      expect(filings).toHaveLength(2)
      expect(filings[0]?.filingDate).toBe("2024-03-15") // Earlier date first
      expect(filings[1]?.filingDate).toBe("2024-09-01")
    })

    it("filters by custom form types", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Apple Inc.",
        filings: {
          recent: [
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
          ],
          files: [],
        },
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filings = await client.discoverFilings({
        cik: "320193",
        from: "2024-01-01",
        to: "2024-12-31",
        formTypes: ["DEF 14A"], // Custom filter
      })

      // Should only return DEF 14A filing
      expect(filings).toHaveLength(1)
      expect(filings[0]?.formType).toBe("DEF 14A")
    })
  })
})
