// Pure normalization functions for SEC EDGAR data

import { ValidationError } from "@/errors"

/**
 * Normalize CIK to canonical 10-digit zero-padded format.
 *
 * Handles both padded ("0000320193") and unpadded ("320193") input.
 * Validates numeric-only and range constraints.
 *
 * @param input - CIK string (padded or unpadded)
 * @returns 10-digit zero-padded CIK
 * @throws ValidationError if input is invalid
 *
 * @example
 * normalizeCik("320193") // "0000320193"
 * normalizeCik("0000320193") // "0000320193"
 */
export function normalizeCik(input: string): string {
  const trimmed = input.trim()

  // Strip leading zeros to get numeric value
  const numeric = trimmed.replace(/^0+/, "") || "0"

  // Validate numeric-only
  if (!/^\d+$/.test(numeric)) {
    throw new ValidationError(`Invalid CIK: must contain only digits`, {
      metadata: { input },
    })
  }

  // Validate range: max 10 digits (9,999,999,999)
  if (Number(numeric) > 9_999_999_999) {
    throw new ValidationError(`Invalid CIK: exceeds maximum 10-digit value`, {
      metadata: { input },
    })
  }

  // Zero-pad to 10 digits
  return numeric.padStart(10, "0")
}

/**
 * Normalize accession number to canonical hyphenated format.
 *
 * Handles multiple input formats:
 * - "0000000000-20-000000" (already hyphenated)
 * - "000000000020000000" (compact)
 * - "0000000000-20000000" (partial hyphen)
 *
 * @param input - Accession number in any format
 * @returns Canonical format: ##########-##-######
 * @throws ValidationError if format is invalid
 *
 * @example
 * normalizeAccession("0001193125-20-123456") // "0001193125-20-123456"
 * normalizeAccession("000119312520123456") // "0001193125-20-123456"
 */
export function normalizeAccession(input: string): string {
  // Remove all spaces and hyphens
  const cleaned = input.replace(/[\s-]/g, "")

  // Validate: exactly 18 digits
  if (!/^\d{18}$/.test(cleaned)) {
    throw new ValidationError(`Invalid accession number: must be 18 digits`, {
      metadata: { input },
    })
  }

  // Format as ##########-##-######
  return `${cleaned.slice(0, 10)}-${cleaned.slice(10, 12)}-${cleaned.slice(12)}`
}

/**
 * Normalize form type to canonical uppercase format.
 *
 * Preserves slashes for amendments (e.g., "10-K/A").
 *
 * @param input - Form type string
 * @returns Uppercase, trimmed form type
 *
 * @example
 * normalizeFormType("10-k") // "10-K"
 * normalizeFormType(" 10-K/A ") // "10-K/A"
 */
export function normalizeFormType(input: string): string {
  return input.trim().toUpperCase()
}

/**
 * Validate date string format.
 *
 * Ensures date is in YYYY-MM-DD ISO format and represents a valid calendar date.
 *
 * @param input - Date string to validate
 * @throws ValidationError if format or value is invalid
 *
 * @example
 * validateDate("2024-01-15") // OK
 * validateDate("2024-02-30") // throws ValidationError
 */
export function validateDate(input: string): void {
  // Check format: YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) {
    throw new ValidationError(`Invalid date format: expected YYYY-MM-DD`, {
      metadata: { input },
    })
  }

  // Parse and validate value - check if parsing changes the date (detects invalid dates)
  const date = new Date(input + "T00:00:00Z")
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid date value`, {
      metadata: { input },
    })
  }

  // Verify the date didn't roll over (e.g., Feb 30 → Mar 2)
  const isoString = date.toISOString().slice(0, 10)
  if (isoString !== input) {
    throw new ValidationError(`Invalid date value`, {
      metadata: { input },
    })
  }
}
