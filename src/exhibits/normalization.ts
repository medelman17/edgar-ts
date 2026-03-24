// Pure normalization functions for exhibit fields

import { ValidationError } from "@/errors"

/**
 * Normalizes exhibit sequence number.
 *
 * Validates that the input is a numeric string. Preserves leading zeros
 * for identity uniqueness (e.g., "001" stays "001" to differentiate from "1"
 * in filing index tables where both may exist).
 *
 * @param input - Exhibit sequence number (may have whitespace or leading zeros)
 * @returns Trimmed numeric string with leading zeros preserved
 * @throws ValidationError if input is not a valid numeric string
 *
 * @example
 * normalizeSequence("1") // "1"
 * normalizeSequence("001") // "001"
 * normalizeSequence("  2  ") // "2"
 */
export function normalizeSequence(input: string): string {
  const trimmed = input.trim()

  // Validate numeric string only
  if (!/^\d+$/.test(trimmed)) {
    throw new ValidationError("Invalid exhibit sequence: must be numeric", {
      metadata: { input },
    })
  }

  return trimmed
}

/**
 * Normalizes exhibit type to canonical hyphenated format.
 *
 * Handles all SEC exhibit type separator variants:
 * - Underscore: EX_10.1 → EX-10.1
 * - Slash: EX/10.1 → EX-10.1
 * - Hyphen: EX-10.1 → EX-10.1 (already canonical)
 *
 * Supports dotted forms (EX-10.1) and letter suffixes (EX-10A).
 *
 * @param input - Exhibit type in any separator format
 * @returns Canonical uppercase hyphenated format (e.g., "EX-10.1")
 * @throws ValidationError if normalized type doesn't match expected pattern
 *
 * @example
 * normalizeExhibitType("ex-10.1") // "EX-10.1"
 * normalizeExhibitType("EX_10.1") // "EX-10.1"
 * normalizeExhibitType("EX/10.1") // "EX-10.1"
 * normalizeExhibitType("EX-10A") // "EX-10A"
 */
export function normalizeExhibitType(input: string): string {
  const trimmed = input.trim()

  // Convert to uppercase
  const upper = trimmed.toUpperCase()

  // Normalize separators: replace _ and / with hyphen
  const normalized = upper.replace(/[_/]/g, "-")

  // Validate pattern: EX-## or EX-##.## or EX-##A (letter suffix)
  // Pattern allows single letter suffix OR dotted decimal, but not both simultaneously
  if (!/^EX-\d+(\.\d+|[A-Z])?$/.test(normalized)) {
    throw new ValidationError(
      "Invalid exhibit type: must match pattern EX-##, EX-##.##, or EX-##A",
      {
        metadata: { input, normalized },
      },
    )
  }

  return normalized
}

/**
 * Normalizes exhibit description.
 *
 * Converts empty or whitespace-only strings to undefined.
 * Trims whitespace from non-empty descriptions.
 *
 * @param input - Optional exhibit description
 * @returns Trimmed description or undefined if empty
 *
 * @example
 * normalizeDescription("Employment Agreement") // "Employment Agreement"
 * normalizeDescription("  Whitespace  ") // "Whitespace"
 * normalizeDescription("") // undefined
 * normalizeDescription("   ") // undefined
 * normalizeDescription(undefined) // undefined
 */
export function normalizeDescription(input?: string): string | undefined {
  if (input === undefined) {
    return undefined
  }

  const trimmed = input.trim()

  return trimmed === "" ? undefined : trimmed
}
