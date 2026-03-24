import { beforeEach, describe, expect, it, vi } from "vitest"
import { EdgarClient } from "@/client"
import type { SubmissionsResponse } from "@/discovery/types"
import { TimeoutError, ValidationError } from "@/errors"
import type { DownloadedExhibit, EdgarClientOptions, ExhibitRef, FilingRef } from "@/types"

// Mock global fetch
const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

describe("README examples", () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  describe("discoverFilings examples", () => {
    it("basic date range query compiles and runs", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Example Corp",
        filings: {
          recent: {
            accessionNumber: ["0001193125-26-100001"],
            filingDate: ["2026-01-15"],
            reportDate: ["2026-01-15"],
            acceptanceDateTime: ["2026-01-15T16:00:00Z"],
            act: ["34"],
            form: ["10-K"],
            fileNumber: ["001-12345"],
            primaryDocument: ["test.htm"],
            primaryDocDescription: [""],
            size: [100000],
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

      // Basic date range query (from README - requires CIK)
      const filings = await client.discoverFilings({
        cik: "320193",
        from: "2026-01-01",
        to: "2026-01-31",
      })

      expect(Array.isArray(filings)).toBe(true)
      expect(filings[0]).toHaveProperty("cik")
      expect(filings[0]).toHaveProperty("accessionNo")
      expect(filings[0]).toHaveProperty("formType")
      expect(filings[0]).toHaveProperty("filingDate")
      expect(filings[0]).toHaveProperty("filingUrl")
    })

    it("filter by CIK example compiles and runs", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Apple Inc.",
        filings: {
          recent: {
            accessionNumber: ["0001193125-26-100001"],
            filingDate: ["2026-01-15"],
            reportDate: ["2026-01-15"],
            acceptanceDateTime: ["2026-01-15T16:00:00Z"],
            act: ["34"],
            form: ["10-K"],
            fileNumber: ["001-36743"],
            primaryDocument: ["test.htm"],
            primaryDocDescription: [""],
            size: [100000],
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

      // Filter by CIK (from README)
      const appleFilings = await client.discoverFilings({
        from: "2026-01-01",
        to: "2026-01-31",
        cik: "320193",
      })

      expect(Array.isArray(appleFilings)).toBe(true)
      expect(appleFilings[0]?.cik).toBe("0000320193") // CIK normalized to 10 digits
    })

    it("custom form types example compiles and runs", async () => {
      const mockResponse: SubmissionsResponse = {
        cik: "0000320193",
        name: "Example Corp",
        filings: {
          recent: {
            accessionNumber: ["0001193125-26-100001"],
            filingDate: ["2026-01-15"],
            reportDate: ["2026-01-15"],
            acceptanceDateTime: ["2026-01-15T16:00:00Z"],
            act: ["34"],
            form: ["8-K"],
            fileNumber: ["001-12345"],
            primaryDocument: ["test.htm"],
            primaryDocDescription: [""],
            size: [100000],
            isXBRL: [0],
            isInlineXBRL: [0],
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

      // Custom form types (from README)
      const customFilings = await client.discoverFilings({
        cik: "320193",
        from: "2026-01-01",
        to: "2026-01-31",
        formTypes: ["8-K"],
      })

      expect(Array.isArray(customFilings)).toBe(true)
      expect(customFilings[0]?.formType).toBe("8-K")
    })
  })

  describe("listExhibits example", () => {
    it("compiles and runs, returns exhibits with expected fields", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
          <tr>
            <td>1</td>
            <td>Employment Agreement</td>
            <td><a href="/Archives/edgar/data/320193/000119312526100001/ex10-1.htm">ex10-1.htm</a></td>
            <td>EX-10.1</td>
            <td>12345</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Consent of Independent Auditor</td>
            <td><a href="/Archives/edgar/data/320193/000119312526100001/ex23-1.htm">ex23-1.htm</a></td>
            <td>EX-23.1</td>
            <td>5678</td>
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

      // Simulate having a filing from discoverFilings
      const filing: FilingRef = {
        cik: "0000320193",
        accessionNo: "0001193125-26-100001",
        formType: "10-K",
        filingDate: "2026-01-15",
        filingUrl:
          "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000320193&type=10-K&dateb=&owner=exclude&count=40",
      }

      // listExhibits example from README
      const exhibits = await client.listExhibits(filing)

      expect(Array.isArray(exhibits)).toBe(true)
      expect(exhibits).toHaveLength(2)
      expect(exhibits[0]).toHaveProperty("sequence")
      expect(exhibits[0]).toHaveProperty("type")
      expect(exhibits[0]).toHaveProperty("description")
      expect(exhibits[0]).toHaveProperty("filename")
      expect(exhibits[0]).toHaveProperty("exhibitUrl")
    })
  })

  describe("listContractExhibits example", () => {
    it("compiles and runs, returns only EX-10* exhibits", async () => {
      const mockIndexHtml = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
          <tr>
            <td>1</td>
            <td>Employment Agreement</td>
            <td><a href="/Archives/edgar/data/320193/000119312526100001/ex10-1.htm">ex10-1.htm</a></td>
            <td>EX-10.1</td>
            <td>12345</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Consent of Independent Auditor</td>
            <td><a href="/Archives/edgar/data/320193/000119312526100001/ex23-1.htm">ex23-1.htm</a></td>
            <td>EX-23.1</td>
            <td>5678</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Lease Agreement</td>
            <td><a href="/Archives/edgar/data/320193/000119312526100001/ex10-2.htm">ex10-2.htm</a></td>
            <td>EX-10.2</td>
            <td>9876</td>
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

      const filing: FilingRef = {
        cik: "0000320193",
        accessionNo: "0001193125-26-100001",
        formType: "10-K",
        filingDate: "2026-01-15",
        filingUrl: "https://example.com",
      }

      // listContractExhibits example from README
      const contractExhibits = await client.listContractExhibits(filing)

      expect(Array.isArray(contractExhibits)).toBe(true)
      expect(contractExhibits).toHaveLength(2)
      expect(contractExhibits[0]?.type).toBe("EX-10.1")
      expect(contractExhibits[1]?.type).toBe("EX-10.2")
    })
  })

  describe("downloadExhibit example", () => {
    it("compiles and runs, returns DownloadedExhibit with all fields", async () => {
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

      // Simulate having a contract exhibit from listContractExhibits
      const exhibit: ExhibitRef = {
        accessionNo: "0001193125-26-100001",
        sequence: "1",
        type: "EX-10.1",
        description: "Employment Agreement",
        filename: "ex10-1.htm",
        exhibitUrl:
          "https://www.sec.gov/Archives/edgar/data/0000320193/000119312526100001/ex10-1.htm",
      }

      // downloadExhibit example from README
      const downloaded = await client.downloadExhibit(exhibit)

      expect(downloaded).toHaveProperty("exhibit")
      expect(downloaded).toHaveProperty("bytes")
      expect(downloaded).toHaveProperty("sizeBytes")
      expect(downloaded).toHaveProperty("sha256")
      expect(downloaded.bytes).toBeInstanceOf(Uint8Array)
      expect(downloaded.sizeBytes).toBe(20)
      expect(downloaded.sha256).toBeTruthy()
      expect(downloaded.sha256).toHaveLength(64)
      expect(downloaded.mimeType).toBe("text/html")
    })
  })

  describe("type exports example", () => {
    it("type imports compile correctly", () => {
      // Type exports example from README
      const options: EdgarClientOptions = {
        userAgent: "Test/1.0",
      }
      expect(options.userAgent).toBeDefined()

      const filing: FilingRef = {
        cik: "0000320193",
        accessionNo: "0001193125-26-100001",
        formType: "10-K",
        filingDate: "2026-01-15",
        filingUrl: "https://example.com",
      }
      expect(filing.cik).toBeDefined()

      const exhibit: ExhibitRef = {
        accessionNo: "0001193125-26-100001",
        sequence: "1",
        type: "EX-10.1",
        filename: "ex10-1.htm",
        exhibitUrl: "https://example.com",
      }
      expect(exhibit.accessionNo).toBeDefined()

      const downloaded: DownloadedExhibit = {
        exhibit: exhibit,
        bytes: new Uint8Array(),
        sizeBytes: 0,
        sha256: "abc123",
      }
      expect(downloaded.sha256).toBeDefined()
    })
  })

  describe("error handling example", () => {
    it("demonstrates typed error catching pattern", () => {
      // Error handling example from README
      const err1 = new ValidationError("Invalid date format")
      expect(err1).toBeInstanceOf(ValidationError)

      const err2 = new TimeoutError("Request timed out")
      expect(err2).toBeInstanceOf(TimeoutError)

      // Verify error detection pattern works
      if (err1 instanceof ValidationError) {
        expect(err1.code).toBe("VALIDATION_ERROR")
        expect(err1.retryable).toBe(false)
      }

      if (err2 instanceof TimeoutError) {
        expect(err2.code).toBe("TIMEOUT")
        expect(err2.retryable).toBe(true)
      }
    })
  })
})
