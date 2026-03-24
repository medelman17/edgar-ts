// Index file discovery tests — parsing SEC master.idx files

import { describe, expect, it, vi } from "vitest"
import { parseIndexFile } from "@/discovery/index-parser"
import { IndexService } from "@/discovery/index-service"
import type { SecHttpClient } from "@/http"

const SAMPLE_MASTER_IDX = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-K|2024-11-01|edgar/data/320193/0001193125-24-100001.txt
789019|MICROSOFT CORP|10-Q|2024-10-15|edgar/data/789019/0001193125-24-200001.txt
1018724|AMAZON COM INC|8-K|2024-10-20|edgar/data/1018724/0001193125-24-300001.txt
320193|Apple Inc.|8-K/A|2024-10-25|edgar/data/320193/0001193125-24-400001.txt
1652044|Alphabet Inc.|DEF 14A|2024-10-30|edgar/data/1652044/0001193125-24-500001.txt
`

describe("parseIndexFile", () => {
  it("should parse pipe-delimited rows into filing entries", () => {
    const entries = parseIndexFile(SAMPLE_MASTER_IDX)

    expect(entries).toHaveLength(5)
    expect(entries[0]).toEqual({
      cik: "0000320193",
      companyName: "Apple Inc.",
      formType: "10-K",
      filingDate: "2024-11-01",
      filename: "edgar/data/320193/0001193125-24-100001.txt",
    })
  })

  it("should normalize CIK to 10-digit zero-padded format", () => {
    const entries = parseIndexFile(SAMPLE_MASTER_IDX)

    expect(entries[0]?.cik).toBe("0000320193")
    expect(entries[1]?.cik).toBe("0000789019")
    expect(entries[2]?.cik).toBe("0001018724")
  })

  it("should normalize form types to uppercase", () => {
    const idx = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-k|2024-11-01|edgar/data/320193/0001193125-24-100001.txt
`
    const entries = parseIndexFile(idx)
    expect(entries[0]?.formType).toBe("10-K")
  })

  it("should skip header lines and dashes", () => {
    const entries = parseIndexFile(SAMPLE_MASTER_IDX)
    // Should not include the header or dash line
    expect(entries.every((e) => e.cik !== "CIK")).toBe(true)
  })

  it("should handle empty input", () => {
    const entries = parseIndexFile("")
    expect(entries).toEqual([])
  })

  it("should skip malformed rows", () => {
    const idx = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-K|2024-11-01|edgar/data/320193/0001193125-24-100001.txt
this is a bad row
789019|MICROSOFT CORP|10-Q|2024-10-15|edgar/data/789019/0001193125-24-200001.txt
`
    const entries = parseIndexFile(idx)
    expect(entries).toHaveLength(2)
  })
})

describe("IndexService", () => {
  function createMockHttpClient(responses: Map<string, string>): SecHttpClient {
    return {
      request: vi.fn().mockImplementation(async (url: string) => ({
        ok: true,
        status: 200,
        text: async () => responses.get(url) ?? "",
      })),
    } as unknown as SecHttpClient
  }

  describe("discoverByIndex", () => {
    it("should fetch quarterly index files for a date range", async () => {
      const q3Content = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-K|2024-09-15|edgar/data/320193/0001193125-24-100001.txt
`
      const q4Content = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
789019|MICROSOFT CORP|10-Q|2024-11-01|edgar/data/789019/0001193125-24-200001.txt
`
      const responses = new Map([
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR3/master.idx", q3Content],
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR4/master.idx", q4Content],
      ])
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      const filings = await service.discoverByIndex({
        from: "2024-07-01",
        to: "2024-12-31",
      })

      expect(filings).toHaveLength(2)
      expect(filings[0]?.cik).toBe("0000320193")
      expect(filings[1]?.cik).toBe("0000789019")
    })

    it("should filter by date range within index results", async () => {
      const content = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-K|2024-09-15|edgar/data/320193/0001193125-24-100001.txt
789019|MICROSOFT CORP|10-Q|2024-08-01|edgar/data/789019/0001193125-24-200001.txt
1018724|AMAZON COM INC|8-K|2024-07-01|edgar/data/1018724/0001193125-24-300001.txt
`
      const responses = new Map([
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR3/master.idx", content],
      ])
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      const filings = await service.discoverByIndex({
        from: "2024-08-01",
        to: "2024-09-30",
      })

      // Should include Aug 1 and Sep 15, not Jul 1
      expect(filings).toHaveLength(2)
    })

    it("should filter by form types when provided", async () => {
      const content = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-K|2024-09-15|edgar/data/320193/0001193125-24-100001.txt
789019|MICROSOFT CORP|10-Q|2024-09-01|edgar/data/789019/0001193125-24-200001.txt
1018724|AMAZON COM INC|8-K|2024-09-10|edgar/data/1018724/0001193125-24-300001.txt
`
      const responses = new Map([
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR3/master.idx", content],
      ])
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      const filings = await service.discoverByIndex({
        from: "2024-07-01",
        to: "2024-12-31",
        formTypes: ["10-K"],
      })

      expect(filings).toHaveLength(1)
      expect(filings[0]?.formType).toBe("10-K")
    })

    it("should deduplicate filings across quarterly files", async () => {
      // Same filing appears in both quarters (edge case at quarter boundary)
      const content = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
320193|Apple Inc.|10-K|2024-09-30|edgar/data/320193/0001193125-24-100001.txt
`
      const responses = new Map([
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR3/master.idx", content],
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR4/master.idx", content],
      ])
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      const filings = await service.discoverByIndex({
        from: "2024-07-01",
        to: "2024-12-31",
      })

      expect(filings).toHaveLength(1)
    })

    it("should return filings sorted by date then accession", async () => {
      const content = `CIK|Company Name|Form Type|Date Filed|Filename
------------------------------------------------------------------------
789019|MICROSOFT CORP|10-Q|2024-09-15|edgar/data/789019/0001193125-24-200001.txt
320193|Apple Inc.|10-K|2024-08-01|edgar/data/320193/0001193125-24-100001.txt
`
      const responses = new Map([
        ["https://www.sec.gov/Archives/edgar/full-index/2024/QTR3/master.idx", content],
      ])
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      const filings = await service.discoverByIndex({
        from: "2024-07-01",
        to: "2024-12-31",
      })

      // Earlier date first
      expect(filings[0]?.filingDate).toBe("2024-08-01")
      expect(filings[1]?.filingDate).toBe("2024-09-15")
    })
  })

  describe("quarterly URL mapping", () => {
    it("should map date range to correct quarterly URLs", async () => {
      const responses = new Map<string, string>()
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      // Q1 = Jan-Mar, Q2 = Apr-Jun, Q3 = Jul-Sep, Q4 = Oct-Dec
      await service.discoverByIndex({ from: "2024-01-15", to: "2024-06-15" })

      // Should fetch Q1 and Q2
      expect(httpClient.request).toHaveBeenCalledTimes(2)
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/full-index/2024/QTR1/master.idx",
        expect.any(Object),
      )
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/full-index/2024/QTR2/master.idx",
        expect.any(Object),
      )
    })

    it("should span multiple years", async () => {
      const responses = new Map<string, string>()
      const httpClient = createMockHttpClient(responses)
      const service = new IndexService(httpClient)

      await service.discoverByIndex({ from: "2023-10-01", to: "2024-03-31" })

      // Should fetch 2023-Q4, 2024-Q1
      expect(httpClient.request).toHaveBeenCalledTimes(2)
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/full-index/2023/QTR4/master.idx",
        expect.any(Object),
      )
      expect(httpClient.request).toHaveBeenCalledWith(
        "https://www.sec.gov/Archives/edgar/full-index/2024/QTR1/master.idx",
        expect.any(Object),
      )
    })
  })
})
