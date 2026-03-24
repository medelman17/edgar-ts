import { beforeEach, describe, expect, it, vi } from "vitest"
import type { SubmissionsResponse } from "@/discovery/types"
import { ConfigurationError, EdgarClient } from "@/index"

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
          recent: {
            accessionNumber: ["0001193125-24-123456", "0001193125-24-789012"],
            filingDate: ["2024-06-15", "2024-03-15"],
            reportDate: ["2024-06-15", "2024-03-15"],
            acceptanceDateTime: ["2024-06-15T16:00:00Z", "2024-03-15T16:00:00Z"],
            act: ["34", "34"],
            form: ["10-Q", "8-K"],
            fileNumber: ["001-36743", "001-36743"],
            primaryDocument: ["aapl-10q_20240615.htm", "aapl-8k_20240315.htm"],
            primaryDocDescription: ["", ""],
            size: [500000, 100000],
            isXBRL: [1, 0],
            isInlineXBRL: [1, 0],
          },
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
          recent: {
            accessionNumber: ["0001193125-24-123456"],
            filingDate: ["2024-06-15"],
            reportDate: ["2024-06-15"],
            acceptanceDateTime: ["2024-06-15T16:00:00Z"],
            act: ["34"],
            form: ["10-K"],
            fileNumber: ["001-36743"],
            primaryDocument: ["test.htm"],
            primaryDocDescription: [""],
            size: [1000000],
            isXBRL: [1],
            isInlineXBRL: [1],
          },
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
          recent: {
            accessionNumber: [
              "0001193125-24-100001",
              "0001193125-24-100001",
              "0001193125-24-100002",
            ],
            filingDate: ["2024-09-01", "2024-09-01", "2024-03-15"],
            reportDate: ["2024-09-01", "2024-09-01", "2024-03-15"],
            acceptanceDateTime: [
              "2024-09-01T16:00:00Z",
              "2024-09-01T16:00:00Z",
              "2024-03-15T16:00:00Z",
            ],
            act: ["34", "34", "34"],
            form: ["8-K", "8-K", "10-Q"],
            fileNumber: ["001-36743", "001-36743", "001-36743"],
            primaryDocument: ["test3.htm", "test3.htm", "test1.htm"],
            primaryDocDescription: ["", "", ""],
            size: [100000, 100000, 500000],
            isXBRL: [0, 0, 1],
            isInlineXBRL: [0, 0, 1],
          },
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
          recent: {
            accessionNumber: ["0001193125-24-100001", "0001193125-24-100002"],
            filingDate: ["2024-06-01", "2024-06-02"],
            reportDate: ["2024-06-01", "2024-06-02"],
            acceptanceDateTime: ["2024-06-01T16:00:00Z", "2024-06-02T16:00:00Z"],
            act: ["34", "34"],
            form: ["10-K", "DEF 14A"],
            fileNumber: ["001-36743", "001-36743"],
            primaryDocument: ["test1.htm", "test2.htm"],
            primaryDocDescription: ["", ""],
            size: [1000000, 500000],
            isXBRL: [1, 0],
            isInlineXBRL: [1, 0],
          },
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

  describe("getCompanyInfo", () => {
    it("returns company metadata for a valid CIK", async () => {
      const mockResponse = {
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
      }

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockResponse,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const info = await client.getCompanyInfo("320193")

      expect(info.cik).toBe("0000320193")
      expect(info.name).toBe("Apple Inc.")
      expect(info.tickers).toEqual(["AAPL"])
      expect(info.exchanges).toEqual(["Nasdaq"])
      expect(info.sic).toBe("3571")
      expect(info.stateOfIncorporation).toBe("CA")
    })
  })

  describe("lookupCompany", () => {
    it("resolves a ticker to company info", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc.", exchange: "Nasdaq" },
        }),
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const results = await client.lookupCompany("AAPL")

      expect(results).toHaveLength(1)
      expect(results[0]?.cik).toBe("0000320193")
    })
  })

  describe("downloadSubmissionsBulk", () => {
    it("returns bulk download result", async () => {
      const data = new TextEncoder().encode("fake-zip")
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => data.buffer,
        headers: { get: (n: string) => (n === "Content-Type" ? "application/zip" : null) },
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const result = await client.downloadSubmissionsBulk()

      expect(result.source).toBe("submissions")
      expect(result.bytes).toBeInstanceOf(Uint8Array)
    })
  })

  describe("downloadCompanyFactsBulk", () => {
    it("returns bulk download result", async () => {
      const data = new TextEncoder().encode("fake-zip")
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => data.buffer,
        headers: { get: (n: string) => (n === "Content-Type" ? "application/zip" : null) },
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const result = await client.downloadCompanyFactsBulk()

      expect(result.source).toBe("companyfacts")
    })
  })

  describe("getCompanyFacts", () => {
    it("returns XBRL facts for a CIK", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ cik: 320193, entityName: "Apple Inc.", facts: {} }),
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const result = await client.getCompanyFacts("320193")

      expect(result.entityName).toBe("Apple Inc.")
    })
  })

  describe("getCompanyConcept", () => {
    it("returns concept time series", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ cik: 320193, taxonomy: "us-gaap", tag: "Revenue", units: { USD: [] } }),
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const result = await client.getCompanyConcept("320193", "us-gaap", "Revenue")

      expect(result.tag).toBe("Revenue")
    })
  })

  describe("getFrame", () => {
    it("returns cross-company frame data", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ taxonomy: "us-gaap", tag: "Revenue", data: [] }),
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const result = await client.getFrame("us-gaap", "Revenue", "USD", "CY2024")

      expect(result.taxonomy).toBe("us-gaap")
    })
  })

  describe("searchFilings", () => {
    it("returns search results", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          hits: {
            total: { value: 1 },
            hits: [
              {
                _id: "test",
                _score: 10,
                _source: {
                  entity_name: "Apple Inc.",
                  form_type: "10-K",
                  file_date: "2024-01-15",
                },
              },
            ],
          },
        }),
      })

      const client = new EdgarClient({ userAgent: "TestBot/1.0 (test@example.com)" })
      const result = await client.searchFilings({ q: "test" })

      expect(result.total).toBe(1)
      expect(result.hits[0]?.entityName).toBe("Apple Inc.")
    })
  })

  describe("listExhibits", () => {
    it("lists all exhibits for a filing with count and field verification", async () => {
      const mockIndexHtml = `
        <!DOCTYPE html>
        <html>
        <body>
          <table class="tableFile">
            <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
            <tr>
              <td>1</td>
              <td>Employment Agreement</td>
              <td><a href="/Archives/edgar/data/320193/000119312520123456/ex10-1.htm">ex10-1.htm</a></td>
              <td>EX-10.1</td>
              <td>12345</td>
            </tr>
            <tr>
              <td>2</td>
              <td>Consent of Independent Auditor</td>
              <td><a href="/Archives/edgar/data/320193/000119312520123456/ex23-1.htm">ex23-1.htm</a></td>
              <td>EX-23.1</td>
              <td>6789</td>
            </tr>
          </table>
        </body>
        </html>
      `

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockIndexHtml,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filing = {
        cik: "0000320193",
        accessionNo: "0001193125-20-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl:
          "https://www.sec.gov/cgi-bin/viewer?action=view&cik=0000320193&accession_number=000119312520123456&xbrl_type=v",
      }

      const exhibits = await client.listExhibits(filing)

      expect(exhibits).toHaveLength(2)
      expect(exhibits[0]).toEqual({
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      })
      expect(exhibits[1]).toEqual({
        accessionNo: "0001193125-20-123456",
        sequence: "2",
        type: "EX-23.1",
        description: "Consent of Independent Auditor",
        filename: "ex23-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex23-1.htm",
      })
    })

    it("normalizes exhibit types (EX_10 → EX-10)", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Contract</td>
            <td><a href="ex10-1.htm">ex10-1.htm</a></td>
            <td>EX_10.1</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Contract</td>
            <td><a href="ex10-2.htm">ex10-2.htm</a></td>
            <td>ex/10.2</td>
          </tr>
        </table>
      `

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockIndexHtml,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filing = {
        cik: "0000320193",
        accessionNo: "0001193125-20-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl: "https://example.com",
      }

      const exhibits = await client.listExhibits(filing)

      expect(exhibits[0]?.type).toBe("EX-10.1")
      expect(exhibits[1]?.type).toBe("EX-10.2")
    })

    it("deduplicates and sorts exhibits correctly", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>10</td>
            <td>Contract 10</td>
            <td><a href="ex10-10.htm">ex10-10.htm</a></td>
            <td>EX-10.10</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Contract 2</td>
            <td><a href="ex10-2.htm">ex10-2.htm</a></td>
            <td>EX-10.2</td>
          </tr>
          <tr>
            <td>1</td>
            <td>Contract 1</td>
            <td><a href="ex10-1.htm">ex10-1.htm</a></td>
            <td>EX-10.1</td>
          </tr>
          <tr>
            <td>1</td>
            <td>Duplicate</td>
            <td><a href="ex10-1-dupe.htm">ex10-1-dupe.htm</a></td>
            <td>EX-10.1</td>
          </tr>
        </table>
      `

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockIndexHtml,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filing = {
        cik: "0000320193",
        accessionNo: "0001193125-20-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl: "https://example.com",
      }

      const exhibits = await client.listExhibits(filing)

      // Should deduplicate (3 unique) and sort numerically by sequence
      expect(exhibits).toHaveLength(3)
      expect(exhibits[0]?.sequence).toBe("1")
      expect(exhibits[1]?.sequence).toBe("2")
      expect(exhibits[2]?.sequence).toBe("10") // numeric sort: 10 after 2
    })
  })

  describe("listContractExhibits", () => {
    it("filters to only EX-10* exhibits", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Contract A</td>
            <td><a href="ex10-1.htm">ex10-1.htm</a></td>
            <td>EX-10.1</td>
          </tr>
          <tr>
            <td>2</td>
            <td>List of Subsidiaries</td>
            <td><a href="ex21-1.htm">ex21-1.htm</a></td>
            <td>EX-21</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Contract B</td>
            <td><a href="ex10-2.htm">ex10-2.htm</a></td>
            <td>EX-10.2</td>
          </tr>
          <tr>
            <td>4</td>
            <td>Press Release</td>
            <td><a href="ex99-1.htm">ex99-1.htm</a></td>
            <td>EX-99.1</td>
          </tr>
        </table>
      `

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockIndexHtml,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filing = {
        cik: "0000320193",
        accessionNo: "0001193125-20-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl: "https://example.com",
      }

      const contracts = await client.listContractExhibits(filing)

      expect(contracts).toHaveLength(2)
      expect(contracts[0]?.type).toBe("EX-10.1")
      expect(contracts[1]?.type).toBe("EX-10.2")
    })

    it("returns empty array when no contract exhibits present", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>List of Subsidiaries</td>
            <td><a href="ex21-1.htm">ex21-1.htm</a></td>
            <td>EX-21</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Press Release</td>
            <td><a href="ex99-1.htm">ex99-1.htm</a></td>
            <td>EX-99.1</td>
          </tr>
        </table>
      `

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockIndexHtml,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filing = {
        cik: "0000320193",
        accessionNo: "0001193125-20-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl: "https://example.com",
      }

      const contracts = await client.listContractExhibits(filing)

      expect(contracts).toEqual([])
    })

    it("includes all EX-10 variants (EX-10, EX-10.1, EX-10A)", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Contract Base</td>
            <td><a href="ex10.htm">ex10.htm</a></td>
            <td>EX-10</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Contract Dotted</td>
            <td><a href="ex10-1.htm">ex10-1.htm</a></td>
            <td>EX-10.1</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Contract Letter</td>
            <td><a href="ex10a.htm">ex10a.htm</a></td>
            <td>EX-10A</td>
          </tr>
        </table>
      `

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => mockIndexHtml,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const filing = {
        cik: "0000320193",
        accessionNo: "0001193125-20-123456",
        formType: "10-K",
        filingDate: "2024-01-15",
        filingUrl: "https://example.com",
      }

      const contracts = await client.listContractExhibits(filing)

      expect(contracts).toHaveLength(3)
      expect(contracts[0]?.type).toBe("EX-10")
      expect(contracts[1]?.type).toBe("EX-10.1")
      expect(contracts[2]?.type).toBe("EX-10A")
    })
  })

  describe("downloadExhibit", () => {
    it("returns complete DownloadedExhibit with all fields", async () => {
      const mockBinaryData = new TextEncoder().encode("Test exhibit content")

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === "Content-Type" ? "text/html; charset=utf-8" : null),
        },
        arrayBuffer: async () => mockBinaryData.buffer,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      }

      const result = await client.downloadExhibit(exhibitRef)

      expect(result.exhibit).toBe(exhibitRef)
      expect(result.bytes).toBeInstanceOf(Uint8Array)
      expect(result.sizeBytes).toBe(20)
      expect(result.mimeType).toBe("text/html")
      expect(result.sha256).toBeTruthy()
      expect(result.sha256).toHaveLength(64)
      expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
    })

    it("extracts MIME type from Content-Type header", async () => {
      const mockBinaryData = new TextEncoder().encode("Test")

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === "Content-Type" ? "application/pdf" : null),
        },
        arrayBuffer: async () => mockBinaryData.buffer,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.pdf",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.pdf",
      }

      const result = await client.downloadExhibit(exhibitRef)

      expect(result.mimeType).toBe("application/pdf")
    })

    it("strips charset from Content-Type", async () => {
      const mockBinaryData = new TextEncoder().encode("Test")

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => (name === "Content-Type" ? "text/html; charset=utf-8" : null),
        },
        arrayBuffer: async () => mockBinaryData.buffer,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      }

      const result = await client.downloadExhibit(exhibitRef)

      expect(result.mimeType).toBe("text/html")
    })

    it("handles missing Content-Type header", async () => {
      const mockBinaryData = new TextEncoder().encode("Test")

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (_name: string) => null,
        },
        arrayBuffer: async () => mockBinaryData.buffer,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      }

      const result = await client.downloadExhibit(exhibitRef)

      expect(result.mimeType).toBeUndefined()
    })

    it("computes correct SHA-256 digest", async () => {
      // Use "abc" as test vector (known SHA-256 from NIST test vectors)
      const mockBinaryData = new TextEncoder().encode("abc")

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (_name: string) => null,
        },
        arrayBuffer: async () => mockBinaryData.buffer,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      }

      const result = await client.downloadExhibit(exhibitRef)

      // NIST test vector for "abc"
      expect(result.sha256).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    })

    it("returns correct sizeBytes matching actual bytes length", async () => {
      const mockBinaryData = new TextEncoder().encode("This is a test exhibit with some content")

      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: {
          get: (_name: string) => null,
        },
        arrayBuffer: async () => mockBinaryData.buffer,
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      }

      const result = await client.downloadExhibit(exhibitRef)

      expect(result.sizeBytes).toBe(40)
      expect(result.bytes.length).toBe(40)
      expect(result.sizeBytes).toBe(result.bytes.length)
    })

    it("uses exhibit.exhibitUrl for fetching", async () => {
      const mockBinaryData = new TextEncoder().encode("Test")
      let fetchedUrl = ""

      mockFetch.mockImplementation(async (url: string | URL | Request) => {
        fetchedUrl = typeof url === "string" ? url : url.toString()
        return {
          ok: true,
          status: 200,
          headers: {
            get: (_name: string) => null,
          },
          arrayBuffer: async () => mockBinaryData.buffer,
        }
      })

      const client = new EdgarClient({
        userAgent: "TestBot/1.0 (test@example.com)",
      })

      const exhibitRef = {
        accessionNo: "0001193125-20-123456",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312520123456/ex10-1.htm",
      }

      await client.downloadExhibit(exhibitRef)

      expect(fetchedUrl).toBe(exhibitRef.exhibitUrl)
    })
  })
})
