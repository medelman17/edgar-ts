// Tests for exhibit normalization functions

import { describe, expect, it } from "vitest"
import { ValidationError } from "@/errors"
import {
  normalizeSequence,
  normalizeExhibitType,
  normalizeDescription,
} from "@/exhibits/normalization"

describe("normalizeSequence", () => {
  describe("valid inputs", () => {
    it("normalizes single digit", () => {
      expect(normalizeSequence("1")).toBe("1")
    })

    it("normalizes multi-digit", () => {
      expect(normalizeSequence("123")).toBe("123")
    })

    it("preserves leading zeros", () => {
      expect(normalizeSequence("001")).toBe("001")
      expect(normalizeSequence("0001")).toBe("0001")
    })

    it("trims whitespace", () => {
      expect(normalizeSequence("  2  ")).toBe("2")
      expect(normalizeSequence("\t999\n")).toBe("999")
    })

    it("handles zero", () => {
      expect(normalizeSequence("0")).toBe("0")
    })

    it("handles very long numeric string", () => {
      const longNum = "123456789012345"
      expect(normalizeSequence(longNum)).toBe(longNum)
    })
  })

  describe("invalid inputs", () => {
    it("rejects non-numeric strings", () => {
      expect(() => normalizeSequence("abc")).toThrow(ValidationError)
      expect(() => normalizeSequence("abc")).toThrow("must be numeric")
    })

    it("rejects alphanumeric strings", () => {
      expect(() => normalizeSequence("12a")).toThrow(ValidationError)
      expect(() => normalizeSequence("a12")).toThrow(ValidationError)
    })

    it("rejects empty string", () => {
      expect(() => normalizeSequence("")).toThrow(ValidationError)
    })

    it("rejects whitespace-only string", () => {
      expect(() => normalizeSequence("   ")).toThrow(ValidationError)
    })

    it("rejects decimal numbers", () => {
      expect(() => normalizeSequence("1.5")).toThrow(ValidationError)
    })

    it("rejects negative numbers", () => {
      expect(() => normalizeSequence("-1")).toThrow(ValidationError)
    })

    it("includes input in error metadata", () => {
      try {
        normalizeSequence("invalid")
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).metadata).toEqual({ input: "invalid" })
      }
    })
  })
})

describe("normalizeExhibitType", () => {
  describe("separator normalization", () => {
    it("normalizes underscore separator", () => {
      expect(normalizeExhibitType("EX_10")).toBe("EX-10")
      expect(normalizeExhibitType("EX_10.1")).toBe("EX-10.1")
    })

    it("normalizes slash separator", () => {
      expect(normalizeExhibitType("EX/10")).toBe("EX-10")
      expect(normalizeExhibitType("EX/10.1")).toBe("EX-10.1")
    })

    it("preserves hyphen separator", () => {
      expect(normalizeExhibitType("EX-10")).toBe("EX-10")
      expect(normalizeExhibitType("EX-10.1")).toBe("EX-10.1")
    })

    it("handles underscore in dotted format", () => {
      expect(normalizeExhibitType("EX_10.1")).toBe("EX-10.1")
    })
  })

  describe("case normalization", () => {
    it("converts lowercase to uppercase", () => {
      expect(normalizeExhibitType("ex-10")).toBe("EX-10")
      expect(normalizeExhibitType("ex-10.1")).toBe("EX-10.1")
    })

    it("converts mixed case to uppercase", () => {
      expect(normalizeExhibitType("Ex-10")).toBe("EX-10")
      expect(normalizeExhibitType("eX-10.1")).toBe("EX-10.1")
    })
  })

  describe("valid formats", () => {
    it("accepts simple numeric type", () => {
      expect(normalizeExhibitType("EX-10")).toBe("EX-10")
      expect(normalizeExhibitType("EX-99")).toBe("EX-99")
      expect(normalizeExhibitType("EX-21")).toBe("EX-21")
    })

    it("accepts dotted decimal format", () => {
      expect(normalizeExhibitType("EX-10.1")).toBe("EX-10.1")
      expect(normalizeExhibitType("EX-10.2")).toBe("EX-10.2")
      expect(normalizeExhibitType("EX-10.01")).toBe("EX-10.01")
    })

    it("accepts letter suffix format", () => {
      expect(normalizeExhibitType("EX-10A")).toBe("EX-10A")
      expect(normalizeExhibitType("EX-10B")).toBe("EX-10B")
      expect(normalizeExhibitType("EX-21A")).toBe("EX-21A")
    })

    it("accepts single-digit exhibit numbers", () => {
      expect(normalizeExhibitType("EX-1")).toBe("EX-1")
      expect(normalizeExhibitType("EX-9")).toBe("EX-9")
    })

    it("accepts three-digit exhibit numbers", () => {
      expect(normalizeExhibitType("EX-100")).toBe("EX-100")
      expect(normalizeExhibitType("EX-999")).toBe("EX-999")
    })
  })

  describe("whitespace handling", () => {
    it("trims leading whitespace", () => {
      expect(normalizeExhibitType("  EX-10.1")).toBe("EX-10.1")
    })

    it("trims trailing whitespace", () => {
      expect(normalizeExhibitType("EX-10.1  ")).toBe("EX-10.1")
    })

    it("trims both leading and trailing whitespace", () => {
      expect(normalizeExhibitType("  EX-10.1  ")).toBe("EX-10.1")
    })
  })

  describe("invalid formats", () => {
    it("rejects reversed format", () => {
      expect(() => normalizeExhibitType("10-EX")).toThrow(ValidationError)
    })

    it("rejects missing hyphen after normalization", () => {
      expect(() => normalizeExhibitType("EX10")).toThrow(ValidationError)
    })

    it("rejects missing prefix", () => {
      expect(() => normalizeExhibitType("10.1")).toThrow(ValidationError)
    })

    it("rejects missing number", () => {
      expect(() => normalizeExhibitType("EX-")).toThrow(ValidationError)
    })

    it("rejects multiple dots", () => {
      expect(() => normalizeExhibitType("EX-10.1.2")).toThrow(ValidationError)
    })

    it("rejects empty string", () => {
      expect(() => normalizeExhibitType("")).toThrow(ValidationError)
    })

    it("rejects whitespace-only string", () => {
      expect(() => normalizeExhibitType("   ")).toThrow(ValidationError)
    })

    it("includes input and normalized value in error metadata", () => {
      try {
        normalizeExhibitType("invalid")
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError)
        expect((error as ValidationError).metadata).toHaveProperty("input", "invalid")
        expect((error as ValidationError).metadata).toHaveProperty("normalized")
      }
    })
  })
})

describe("normalizeDescription", () => {
  describe("valid inputs", () => {
    it("returns unchanged non-empty string", () => {
      expect(normalizeDescription("Employment Agreement")).toBe("Employment Agreement")
    })

    it("trims whitespace from non-empty string", () => {
      expect(normalizeDescription("  Whitespace  ")).toBe("Whitespace")
      expect(normalizeDescription("\tTabs\n")).toBe("Tabs")
    })

    it("handles long description", () => {
      const long = "A".repeat(500)
      expect(normalizeDescription(long)).toBe(long)
    })

    it("handles special characters", () => {
      expect(normalizeDescription("Agreement & Consent")).toBe("Agreement & Consent")
      expect(normalizeDescription("10-K/A Amendment")).toBe("10-K/A Amendment")
    })
  })

  describe("empty inputs", () => {
    it("converts empty string to undefined", () => {
      expect(normalizeDescription("")).toBeUndefined()
    })

    it("converts whitespace-only to undefined", () => {
      expect(normalizeDescription("   ")).toBeUndefined()
      expect(normalizeDescription("\t\n")).toBeUndefined()
    })

    it("returns undefined for undefined input", () => {
      expect(normalizeDescription(undefined)).toBeUndefined()
    })
  })
})
