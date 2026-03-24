import { describe, expect, test } from "vitest"
import { dedupeAndSort } from "@/discovery"
import type { FilingRef } from "@/types"

describe("dedupeAndSort", () => {
  test("returns empty array for empty input", () => {
    const result = dedupeAndSort([])
    expect(result).toEqual([])
  })

  test("returns single filing unchanged", () => {
    const filing: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl:
        "https://www.sec.gov/Archives/edgar/data/320193/000119312520123456/0001193125-20-123456.txt",
    }

    const result = dedupeAndSort([filing])
    expect(result).toEqual([filing])
  })

  test("removes exact duplicates (same CIK + accession)", () => {
    const filing1: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl:
        "https://www.sec.gov/Archives/edgar/data/320193/000119312520123456/0001193125-20-123456.txt",
    }

    const filing2: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl:
        "https://www.sec.gov/Archives/edgar/data/320193/000119312520123456/0001193125-20-123456.txt",
    }

    const result = dedupeAndSort([filing1, filing2])
    expect(result).toHaveLength(1)
    expect(result[0]).toEqual(filing1) // First occurrence retained
  })

  test("retains first occurrence when multiple duplicates exist", () => {
    const filing1: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url1",
    }

    const filing2: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url2", // Different URL
    }

    const filing3: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url3", // Different URL
    }

    const result = dedupeAndSort([filing1, filing2, filing3])
    expect(result).toHaveLength(1)
    expect(result[0].filingUrl).toBe("https://www.sec.gov/url1") // First occurrence
  })

  test("keeps filings with same CIK but different accessions", () => {
    const filing1: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url1",
    }

    const filing2: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-654321",
      formType: "10-Q",
      filingDate: "2020-07-30",
      filingUrl: "https://www.sec.gov/url2",
    }

    const result = dedupeAndSort([filing1, filing2])
    expect(result).toHaveLength(2)
  })

  test("keeps filings with same accession but different CIKs", () => {
    const filing1: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url1",
    }

    const filing2: FilingRef = {
      cik: "0000789019",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url2",
    }

    const result = dedupeAndSort([filing1, filing2])
    expect(result).toHaveLength(2)
  })

  test("sorts by filingDate ascending (primary)", () => {
    const filing1: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-123456",
      formType: "10-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url1",
    }

    const filing2: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-19-111111",
      formType: "10-K",
      filingDate: "2019-10-30",
      filingUrl: "https://www.sec.gov/url2",
    }

    const filing3: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-21-222222",
      formType: "10-K",
      filingDate: "2021-10-28",
      filingUrl: "https://www.sec.gov/url3",
    }

    const result = dedupeAndSort([filing1, filing3, filing2]) // Unsorted input
    expect(result).toHaveLength(3)
    expect(result[0].filingDate).toBe("2019-10-30")
    expect(result[1].filingDate).toBe("2020-10-29")
    expect(result[2].filingDate).toBe("2021-10-28")
  })

  test("sorts by accessionNo ascending when dates are the same (secondary)", () => {
    const filing1: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-333333",
      formType: "8-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url1",
    }

    const filing2: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-111111",
      formType: "8-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url2",
    }

    const filing3: FilingRef = {
      cik: "0000320193",
      accessionNo: "0001193125-20-222222",
      formType: "8-K",
      filingDate: "2020-10-29",
      filingUrl: "https://www.sec.gov/url3",
    }

    const result = dedupeAndSort([filing1, filing3, filing2]) // Unsorted input
    expect(result).toHaveLength(3)
    expect(result[0].accessionNo).toBe("0001193125-20-111111")
    expect(result[1].accessionNo).toBe("0001193125-20-222222")
    expect(result[2].accessionNo).toBe("0001193125-20-333333")
  })

  test("handles large dataset with duplicates", () => {
    const filings: FilingRef[] = []

    // Create 100 filings with 50 unique, 50 duplicates
    for (let i = 0; i < 50; i++) {
      const filing: FilingRef = {
        cik: "0000320193",
        accessionNo: `0001193125-20-${String(i).padStart(6, "0")}`,
        formType: "10-K",
        filingDate: `2020-${String((i % 12) + 1).padStart(2, "0")}-15`,
        filingUrl: `https://www.sec.gov/url${i}`,
      }
      filings.push(filing)
      filings.push({ ...filing, filingUrl: `https://www.sec.gov/dup${i}` }) // Duplicate
    }

    const result = dedupeAndSort(filings)
    expect(result).toHaveLength(50) // Only unique filings
  })

  test("verifies stable sort order with large dataset", () => {
    const filings: FilingRef[] = []

    // Create filings with varied dates
    for (let i = 0; i < 20; i++) {
      filings.push({
        cik: "0000320193",
        accessionNo: `0001193125-20-${String(i).padStart(6, "0")}`,
        formType: "10-K",
        filingDate: `2020-${String((i % 3) + 1).padStart(2, "0")}-15`,
        filingUrl: `https://www.sec.gov/url${i}`,
      })
    }

    const result = dedupeAndSort(filings)

    // Verify chronological order
    for (let i = 1; i < result.length; i++) {
      const prev = result[i - 1]
      const curr = result[i]

      if (!prev || !curr) {
        throw new Error("Unexpected undefined in result array")
      }

      const dateCompare = prev.filingDate.localeCompare(curr.filingDate)
      if (dateCompare > 0) {
        throw new Error("Dates not in ascending order")
      }

      // If dates are equal, verify accessionNo order
      if (dateCompare === 0) {
        const accessionCompare = prev.accessionNo.localeCompare(curr.accessionNo)
        expect(accessionCompare).toBeLessThanOrEqual(0)
      }
    }
  })

  test("handles no duplicates (all unique)", () => {
    const filings: FilingRef[] = [
      {
        cik: "0000320193",
        accessionNo: "0001193125-20-111111",
        formType: "10-K",
        filingDate: "2020-01-15",
        filingUrl: "https://www.sec.gov/url1",
      },
      {
        cik: "0000320193",
        accessionNo: "0001193125-20-222222",
        formType: "10-Q",
        filingDate: "2020-04-15",
        filingUrl: "https://www.sec.gov/url2",
      },
      {
        cik: "0000789019",
        accessionNo: "0001193125-20-333333",
        formType: "8-K",
        filingDate: "2020-03-15",
        filingUrl: "https://www.sec.gov/url3",
      },
    ]

    const result = dedupeAndSort(filings)
    expect(result).toHaveLength(3)

    // Verify sorted by date
    expect(result[0]?.filingDate).toBe("2020-01-15")
    expect(result[1]?.filingDate).toBe("2020-03-15")
    expect(result[2]?.filingDate).toBe("2020-04-15")
  })
})
