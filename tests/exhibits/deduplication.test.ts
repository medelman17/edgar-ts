import { describe, expect, it } from "vitest"
import { dedupeAndSortExhibits } from "@/exhibits/deduplication"
import type { ExhibitRef } from "@/types"

describe("dedupeAndSortExhibits", () => {
  // Helper to create minimal ExhibitRef
  const makeExhibit = (
    accessionNo: string,
    sequence: string,
    filename: string,
    type = "EX-10.1",
  ): ExhibitRef => ({
    accessionNo,
    sequence,
    filename,
    type,
    exhibitUrl: `https://www.sec.gov/Archives/edgar/data/0000320193/${accessionNo}/${filename}`,
  })

  describe("Deduplication (filing-local identity)", () => {
    it("returns empty array for empty input", () => {
      expect(dedupeAndSortExhibits([])).toEqual([])
    })

    it("returns same exhibit for single input", () => {
      const exhibit = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const result = dedupeAndSortExhibits([exhibit])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(exhibit)
    })

    it("removes exact duplicates (same accessionNo + sequence)", () => {
      const exhibit1 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const exhibit2 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")

      const result = dedupeAndSortExhibits([exhibit1, exhibit2])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(exhibit1) // First occurrence retained
    })

    it("retains first occurrence when duplicates exist", () => {
      const first = makeExhibit("0001193125-20-123456", "1", "first.htm")
      const duplicate = makeExhibit("0001193125-20-123456", "1", "duplicate.htm")

      const result = dedupeAndSortExhibits([first, duplicate])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(first)
      expect(result[0].filename).toBe("first.htm")
    })

    it("removes multiple duplicates of same exhibit", () => {
      const exhibit1 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const exhibit2 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const exhibit3 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")

      const result = dedupeAndSortExhibits([exhibit1, exhibit2, exhibit3])

      expect(result).toHaveLength(1)
      expect(result[0]).toBe(exhibit1)
    })

    it("keeps both exhibits when accessionNo same but sequence different", () => {
      const exhibit1 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const exhibit2 = makeExhibit("0001193125-20-123456", "2", "ex10-2.htm")

      const result = dedupeAndSortExhibits([exhibit1, exhibit2])

      expect(result).toHaveLength(2)
    })

    it("keeps both exhibits when sequence same but accessionNo different", () => {
      const exhibit1 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const exhibit2 = makeExhibit("0001193125-21-654321", "1", "ex10-1.htm")

      const result = dedupeAndSortExhibits([exhibit1, exhibit2])

      expect(result).toHaveLength(2)
    })

    it("keeps both exhibits when both accessionNo and sequence different", () => {
      const exhibit1 = makeExhibit("0001193125-20-123456", "1", "ex10-1.htm")
      const exhibit2 = makeExhibit("0001193125-21-654321", "2", "ex10-2.htm")

      const result = dedupeAndSortExhibits([exhibit1, exhibit2])

      expect(result).toHaveLength(2)
    })

    it("handles large dataset with duplicates correctly", () => {
      const exhibits: ExhibitRef[] = []

      // Create 100 exhibits: 50 unique (sequences 0-49), each duplicated once
      for (let i = 0; i < 50; i++) {
        const seq = String(i)
        exhibits.push(makeExhibit("0001193125-20-123456", seq, `ex${i}.htm`))
        exhibits.push(makeExhibit("0001193125-20-123456", seq, `ex${i}.htm`)) // duplicate
      }

      const result = dedupeAndSortExhibits(exhibits)

      expect(result).toHaveLength(50)
      // Verify all sequences are unique
      const sequences = new Set(result.map((e) => e.sequence))
      expect(sequences.size).toBe(50)
    })
  })

  describe("Sorting (sequence numeric, filename string)", () => {
    it("sorts by sequence NUMERIC ascending: [10, 2, 1] → [1, 2, 10]", () => {
      const exhibits = [
        makeExhibit("0001193125-20-123456", "10", "ex10.htm"),
        makeExhibit("0001193125-20-123456", "2", "ex2.htm"),
        makeExhibit("0001193125-20-123456", "1", "ex1.htm"),
      ]

      const result = dedupeAndSortExhibits(exhibits)

      expect(result[0].sequence).toBe("1")
      expect(result[1].sequence).toBe("2")
      expect(result[2].sequence).toBe("10")
    })

    it("sorts same sequence by filename ascending", () => {
      const exhibits = [
        makeExhibit("0001193125-20-123456", "1", "c.htm"),
        makeExhibit("0001193125-21-654321", "1", "a.htm"),
        makeExhibit("0001193125-22-999999", "1", "b.htm"),
      ]

      const result = dedupeAndSortExhibits(exhibits)

      expect(result[0].filename).toBe("a.htm")
      expect(result[1].filename).toBe("b.htm")
      expect(result[2].filename).toBe("c.htm")
    })

    it("applies stable two-level sort (sequence numeric, then filename)", () => {
      const exhibits = [
        makeExhibit("0001193125-20-123456", "10", "z.htm"),
        makeExhibit("0001193125-20-123456", "2", "y.htm"),
        makeExhibit("0001193125-21-654321", "2", "a.htm"),
        makeExhibit("0001193125-20-123456", "1", "x.htm"),
      ]

      const result = dedupeAndSortExhibits(exhibits)

      expect(result[0].sequence).toBe("1")
      expect(result[0].filename).toBe("x.htm")

      expect(result[1].sequence).toBe("2")
      expect(result[1].filename).toBe("a.htm") // filename "a" before "y"

      expect(result[2].sequence).toBe("2")
      expect(result[2].filename).toBe("y.htm")

      expect(result[3].sequence).toBe("10")
      expect(result[3].filename).toBe("z.htm")
    })

    it("verifies 10 comes after 2 (not lexicographic)", () => {
      const exhibits = [
        makeExhibit("0001193125-20-123456", "10", "ex10.htm"),
        makeExhibit("0001193125-20-123456", "2", "ex2.htm"),
      ]

      const result = dedupeAndSortExhibits(exhibits)

      // Numeric order: 2 < 10 (correct)
      // Lexicographic order: "10" < "2" (wrong)
      expect(result[0].sequence).toBe("2")
      expect(result[1].sequence).toBe("10")
    })

    it("handles multi-digit sequences correctly: 1, 2, 10, 11, 100", () => {
      const exhibits = [
        makeExhibit("0001193125-20-123456", "100", "ex100.htm"),
        makeExhibit("0001193125-20-123456", "11", "ex11.htm"),
        makeExhibit("0001193125-20-123456", "2", "ex2.htm"),
        makeExhibit("0001193125-20-123456", "1", "ex1.htm"),
        makeExhibit("0001193125-20-123456", "10", "ex10.htm"),
      ]

      const result = dedupeAndSortExhibits(exhibits)

      expect(result[0].sequence).toBe("1")
      expect(result[1].sequence).toBe("2")
      expect(result[2].sequence).toBe("10")
      expect(result[3].sequence).toBe("11")
      expect(result[4].sequence).toBe("100")
    })

    it("applies filename secondary sort when sequences equal", () => {
      const exhibits = [
        makeExhibit("0001193125-22-999999", "1", "c.htm"),
        makeExhibit("0001193125-21-654321", "1", "a.htm"),
        makeExhibit("0001193125-20-123456", "1", "b.htm"),
      ]

      const result = dedupeAndSortExhibits(exhibits)

      expect(result[0].filename).toBe("a.htm")
      expect(result[1].filename).toBe("b.htm")
      expect(result[2].filename).toBe("c.htm")
    })

    it("combines deduplication and sorting with unsorted duplicates", () => {
      const exhibits = [
        makeExhibit("0001193125-20-123456", "10", "z.htm"),
        makeExhibit("0001193125-20-123456", "2", "y.htm"),
        makeExhibit("0001193125-20-123456", "10", "z.htm"), // duplicate
        makeExhibit("0001193125-20-123456", "1", "x.htm"),
        makeExhibit("0001193125-20-123456", "2", "y.htm"), // duplicate
      ]

      const result = dedupeAndSortExhibits(exhibits)

      expect(result).toHaveLength(3)
      expect(result[0].sequence).toBe("1")
      expect(result[1].sequence).toBe("2")
      expect(result[2].sequence).toBe("10")
    })
  })
})
