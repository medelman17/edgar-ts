import { describe, expect, it } from "vitest"
import { isContractExhibit } from "@/exhibits/filters/contract"

describe("isContractExhibit", () => {
  describe("Positive matches (EX-10 variants)", () => {
    it("matches base form: EX-10", () => {
      expect(isContractExhibit("EX-10")).toBe(true)
    })

    it("matches dotted single digit: EX-10.1", () => {
      expect(isContractExhibit("EX-10.1")).toBe(true)
    })

    it("matches dotted single digit: EX-10.2", () => {
      expect(isContractExhibit("EX-10.2")).toBe(true)
    })

    it("matches dotted single digit: EX-10.9", () => {
      expect(isContractExhibit("EX-10.9")).toBe(true)
    })

    it("matches dotted two digits: EX-10.01", () => {
      expect(isContractExhibit("EX-10.01")).toBe(true)
    })

    it("matches dotted two digits: EX-10.10", () => {
      expect(isContractExhibit("EX-10.10")).toBe(true)
    })

    it("matches dotted two digits: EX-10.99", () => {
      expect(isContractExhibit("EX-10.99")).toBe(true)
    })

    it("matches dotted three digits: EX-10.001", () => {
      expect(isContractExhibit("EX-10.001")).toBe(true)
    })

    it("matches dotted three digits: EX-10.123", () => {
      expect(isContractExhibit("EX-10.123")).toBe(true)
    })

    it("matches letter suffix: EX-10A", () => {
      expect(isContractExhibit("EX-10A")).toBe(true)
    })

    it("matches letter suffix: EX-10B", () => {
      expect(isContractExhibit("EX-10B")).toBe(true)
    })

    it("matches letter suffix: EX-10Z", () => {
      expect(isContractExhibit("EX-10Z")).toBe(true)
    })

    it("matches edge case: EX-10.0", () => {
      expect(isContractExhibit("EX-10.0")).toBe(true)
    })
  })

  describe("Negative matches (non-EX-10 exhibits)", () => {
    it("rejects EX-21 (subsidiaries)", () => {
      expect(isContractExhibit("EX-21")).toBe(false)
    })

    it("rejects EX-99 (additional)", () => {
      expect(isContractExhibit("EX-99")).toBe(false)
    })

    it("rejects EX-23 (consents)", () => {
      expect(isContractExhibit("EX-23")).toBe(false)
    })

    it("rejects EX-31 (certifications)", () => {
      expect(isContractExhibit("EX-31")).toBe(false)
    })

    it("rejects EX-32 (certifications)", () => {
      expect(isContractExhibit("EX-32")).toBe(false)
    })

    it("rejects EX10 (no hyphen)", () => {
      expect(isContractExhibit("EX10")).toBe(false)
    })

    it("rejects 10-EX (reversed)", () => {
      expect(isContractExhibit("10-EX")).toBe(false)
    })

    it("rejects EX-10.1.2 (too many dots)", () => {
      expect(isContractExhibit("EX-10.1.2")).toBe(false)
    })

    it("rejects lowercase: ex-10", () => {
      expect(isContractExhibit("ex-10")).toBe(false)
    })

    it("rejects underscore separator: EX_10", () => {
      expect(isContractExhibit("EX_10")).toBe(false)
    })

    it("rejects slash separator: EX/10", () => {
      expect(isContractExhibit("EX/10")).toBe(false)
    })

    it("rejects empty string", () => {
      expect(isContractExhibit("")).toBe(false)
    })

    it("rejects non-EX type: 10-K", () => {
      expect(isContractExhibit("10-K")).toBe(false)
    })

    it("rejects EX-10AB (multiple letters)", () => {
      expect(isContractExhibit("EX-10AB")).toBe(false)
    })

    it("rejects EX-10.A (letter after dot)", () => {
      expect(isContractExhibit("EX-10.A")).toBe(false)
    })
  })

  describe("Combined filtering", () => {
    it("filters array of mixed exhibit types to only EX-10* variants", () => {
      const exhibitTypes = [
        "EX-10",
        "EX-10.1",
        "EX-10A",
        "EX-21",
        "EX-99",
        "EX-10.2",
        "EX-23",
        "EX-10B",
        "EX-31",
        "EX-10.01",
      ]

      const contracts = exhibitTypes.filter(isContractExhibit)

      expect(contracts).toEqual(["EX-10", "EX-10.1", "EX-10A", "EX-10.2", "EX-10B", "EX-10.01"])
      expect(contracts).toHaveLength(6)
    })

    it("returns empty array when no EX-10* exhibits present", () => {
      const exhibitTypes = ["EX-21", "EX-99", "EX-23", "EX-31", "EX-32"]

      const contracts = exhibitTypes.filter(isContractExhibit)

      expect(contracts).toEqual([])
      expect(contracts).toHaveLength(0)
    })

    it("returns all exhibits when all are EX-10* variants", () => {
      const exhibitTypes = ["EX-10", "EX-10.1", "EX-10.2", "EX-10A", "EX-10B"]

      const contracts = exhibitTypes.filter(isContractExhibit)

      expect(contracts).toEqual(exhibitTypes)
      expect(contracts).toHaveLength(5)
    })
  })
})
