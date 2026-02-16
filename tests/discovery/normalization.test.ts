import { describe, test, expect } from "vitest"
import {
  normalizeCik,
  normalizeAccession,
  normalizeFormType,
  validateDate,
} from "@/discovery"
import { ValidationError } from "@/errors"

describe("normalizeCik", () => {
  test("pads unpadded CIK to 10 digits", () => {
    expect(normalizeCik("320193")).toBe("0000320193")
    expect(normalizeCik("1234")).toBe("0000001234")
    expect(normalizeCik("1")).toBe("0000000001")
  })

  test("preserves already-padded CIK", () => {
    expect(normalizeCik("0000320193")).toBe("0000320193")
    expect(normalizeCik("0000001234")).toBe("0000001234")
  })

  test("strips extra leading zeros and re-pads", () => {
    expect(normalizeCik("00000000320193")).toBe("0000320193")
    expect(normalizeCik("000000000001")).toBe("0000000001")
  })

  test("handles zero CIK", () => {
    expect(normalizeCik("0")).toBe("0000000000")
    expect(normalizeCik("0000000000")).toBe("0000000000")
  })

  test("trims whitespace", () => {
    expect(normalizeCik("  320193  ")).toBe("0000320193")
    expect(normalizeCik("\t0000320193\n")).toBe("0000320193")
  })

  test("is idempotent with 5 iterations", () => {
    let cik = "320193"
    for (let i = 0; i < 5; i++) {
      cik = normalizeCik(cik)
    }
    expect(cik).toBe("0000320193")

    // Try with already-padded
    let padded = "0000320193"
    for (let i = 0; i < 5; i++) {
      padded = normalizeCik(padded)
    }
    expect(padded).toBe("0000320193")
  })

  test("rejects CIK with letters", () => {
    expect(() => normalizeCik("ABC123")).toThrow(ValidationError)
    expect(() => normalizeCik("12345X")).toThrow(ValidationError)
    expect(() => normalizeCik("abc")).toThrow(ValidationError)
  })

  test("rejects CIK with special characters", () => {
    expect(() => normalizeCik("123-456")).toThrow(ValidationError)
    expect(() => normalizeCik("123.456")).toThrow(ValidationError)
    expect(() => normalizeCik("123,456")).toThrow(ValidationError)
  })

  test("rejects CIK exceeding 10-digit max", () => {
    expect(() => normalizeCik("12345678901")).toThrow(ValidationError)
    expect(() => normalizeCik("99999999999")).toThrow(ValidationError)
  })

  test("accepts maximum valid CIK", () => {
    expect(normalizeCik("9999999999")).toBe("9999999999")
  })
})

describe("normalizeAccession", () => {
  test("preserves already-hyphenated format", () => {
    expect(normalizeAccession("0001193125-20-123456")).toBe("0001193125-20-123456")
    expect(normalizeAccession("0000000000-99-000001")).toBe("0000000000-99-000001")
  })

  test("formats compact 18-digit string", () => {
    expect(normalizeAccession("000119312520123456")).toBe("0001193125-20-123456")
    expect(normalizeAccession("000000000099000001")).toBe("0000000000-99-000001")
  })

  test("formats partial hyphen (single hyphen)", () => {
    expect(normalizeAccession("0001193125-20123456")).toBe("0001193125-20-123456")
    expect(normalizeAccession("0000000000-99000001")).toBe("0000000000-99-000001")
  })

  test("removes spaces", () => {
    expect(normalizeAccession("0001193125 20 123456")).toBe("0001193125-20-123456")
    expect(normalizeAccession("0001193125  20  123456")).toBe("0001193125-20-123456")
  })

  test("removes mixed spaces and hyphens", () => {
    expect(normalizeAccession("0001193125 - 20 - 123456")).toBe("0001193125-20-123456")
    expect(normalizeAccession("0001193125- 20-123456")).toBe("0001193125-20-123456")
  })

  test("rejects accession with too few digits", () => {
    expect(() => normalizeAccession("00011931252012345")).toThrow(ValidationError) // 17 digits
    expect(() => normalizeAccession("123456")).toThrow(ValidationError)
  })

  test("rejects accession with too many digits", () => {
    expect(() => normalizeAccession("0001193125201234567")).toThrow(ValidationError) // 19 digits
    expect(() => normalizeAccession("00011931252012345678")).toThrow(ValidationError)
  })

  test("rejects accession with letters", () => {
    expect(() => normalizeAccession("0001193125-2A-123456")).toThrow(ValidationError)
    expect(() => normalizeAccession("ABC119312520123456")).toThrow(ValidationError)
  })

  test("rejects accession with special characters", () => {
    expect(() => normalizeAccession("0001193125.20.123456")).toThrow(ValidationError)
    expect(() => normalizeAccession("0001193125/20/123456")).toThrow(ValidationError)
  })
})

describe("normalizeFormType", () => {
  test("converts lowercase to uppercase", () => {
    expect(normalizeFormType("10-k")).toBe("10-K")
    expect(normalizeFormType("8-k")).toBe("8-K")
    expect(normalizeFormType("s-1")).toBe("S-1")
  })

  test("converts mixed case to uppercase", () => {
    expect(normalizeFormType("10-K/a")).toBe("10-K/A")
    expect(normalizeFormType("10-k/A")).toBe("10-K/A")
  })

  test("preserves already-uppercase", () => {
    expect(normalizeFormType("10-K")).toBe("10-K")
    expect(normalizeFormType("8-K/A")).toBe("8-K/A")
  })

  test("trims whitespace", () => {
    expect(normalizeFormType("  10-K  ")).toBe("10-K")
    expect(normalizeFormType("\t8-K/A\n")).toBe("8-K/A")
  })

  test("preserves slashes for amendments", () => {
    expect(normalizeFormType("10-k/a")).toBe("10-K/A")
    expect(normalizeFormType("10-Q/A")).toBe("10-Q/A")
  })

  test("handles various form types", () => {
    expect(normalizeFormType("20-f")).toBe("20-F")
    expect(normalizeFormType("def 14a")).toBe("DEF 14A")
    expect(normalizeFormType("sc 13d")).toBe("SC 13D")
  })
})

describe("validateDate", () => {
  test("accepts valid YYYY-MM-DD dates", () => {
    expect(() => validateDate("2024-01-15")).not.toThrow()
    expect(() => validateDate("2020-12-31")).not.toThrow()
    expect(() => validateDate("2023-06-01")).not.toThrow()
  })

  test("accepts leap year date", () => {
    expect(() => validateDate("2024-02-29")).not.toThrow()
    expect(() => validateDate("2020-02-29")).not.toThrow()
  })

  test("rejects invalid format (wrong separator)", () => {
    expect(() => validateDate("2024/01/15")).toThrow(ValidationError)
    expect(() => validateDate("2024.01.15")).toThrow(ValidationError)
  })

  test("rejects invalid format (wrong length)", () => {
    expect(() => validateDate("24-01-15")).toThrow(ValidationError)
    expect(() => validateDate("2024-1-15")).toThrow(ValidationError)
    expect(() => validateDate("2024-01-5")).toThrow(ValidationError)
  })

  test("rejects invalid date value (Feb 30)", () => {
    expect(() => validateDate("2024-02-30")).toThrow(ValidationError)
  })

  test("rejects invalid date value (month 13)", () => {
    expect(() => validateDate("2024-13-01")).toThrow(ValidationError)
  })

  test("rejects invalid date value (day 32)", () => {
    expect(() => validateDate("2024-01-32")).toThrow(ValidationError)
  })

  test("rejects non-leap year Feb 29", () => {
    expect(() => validateDate("2023-02-29")).toThrow(ValidationError)
  })

  test("rejects invalid characters", () => {
    expect(() => validateDate("XXXX-XX-XX")).toThrow(ValidationError)
    expect(() => validateDate("2024-ab-cd")).toThrow(ValidationError)
  })

  test("rejects empty string", () => {
    expect(() => validateDate("")).toThrow(ValidationError)
  })
})
