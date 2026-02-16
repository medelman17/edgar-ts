// Contract exhibit (EX-10*) filtering

/**
 * Determines if a normalized exhibit type is a material contract (EX-10*).
 *
 * Matches all EX-10 variants including:
 * - Base: EX-10
 * - Dotted: EX-10.1, EX-10.2, EX-10.01, EX-10.123
 * - Lettered: EX-10A, EX-10B, EX-10Z
 *
 * The input must be a normalized exhibit type (uppercase, hyphenated).
 * This function performs pattern matching only — normalization happens upstream.
 *
 * Pattern: /^EX-10(\.\d+|[A-Z])?$/
 * - ^EX-10 — Must start with "EX-10"
 * - (\.\d+|[A-Z])? — Optional: dot + digits OR single letter
 * - $ — Must end (rejects EX-10.1.2, EX-10AB)
 *
 * @param normalizedType - Normalized exhibit type (uppercase, hyphenated)
 * @returns true if exhibit is a material contract, false otherwise
 *
 * @example
 * isContractExhibit("EX-10")     // true
 * isContractExhibit("EX-10.1")   // true
 * isContractExhibit("EX-10A")    // true
 * isContractExhibit("EX-21")     // false
 * isContractExhibit("EX-99")     // false
 * isContractExhibit("EX10")      // false (no hyphen)
 */
export function isContractExhibit(normalizedType: string): boolean {
  return /^EX-10(\.\d+|[A-Z])?$/.test(normalizedType)
}
