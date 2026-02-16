// Deduplication and stable sort for filing discovery

import type { FilingRef } from "@/types"

/**
 * Deduplicate and stable-sort filing references.
 *
 * Deduplication uses identity key: `{cik}:{accessionNo}`
 * - Retains first occurrence of each unique filing
 * - Assumes inputs are already normalized (CIK padded, accession hyphenated)
 *
 * Stable sort order:
 * 1. Primary: filingDate ascending (lexicographic for ISO 8601)
 * 2. Secondary: accessionNo ascending (lexicographic)
 * 3. Preserves input order for ties
 *
 * @param filings - Array of filing references (may contain duplicates)
 * @returns Deduplicated, sorted array
 *
 * @example
 * const filings = [
 *   { cik: "0000320193", accessionNo: "0001193125-20-123456", ... },
 *   { cik: "0000320193", accessionNo: "0001193125-20-123456", ... }, // duplicate
 * ]
 * const result = dedupeAndSort(filings)
 * // result.length === 1
 */
export function dedupeAndSort(filings: FilingRef[]): FilingRef[] {
  // Build identity map: "{cik}:{accessionNo}" → first occurrence
  const identityMap = new Map<string, FilingRef>()

  for (const filing of filings) {
    const identity = `${filing.cik}:${filing.accessionNo}`

    // Retain first occurrence only
    if (!identityMap.has(identity)) {
      identityMap.set(identity, filing)
    }
    // If duplicate, skip (or emit telemetry if available)
  }

  // Convert map values to array
  const deduplicated = Array.from(identityMap.values())

  // Stable sort: filingDate asc, then accessionNo asc
  return deduplicated.sort((a, b) => {
    // Primary sort: filingDate ascending
    const dateOrder = a.filingDate.localeCompare(b.filingDate)
    if (dateOrder !== 0) return dateOrder

    // Secondary sort: accessionNo ascending
    return a.accessionNo.localeCompare(b.accessionNo)
  })
}
