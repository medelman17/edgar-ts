// Deduplication and stable sort for exhibit enumeration

import type { ExhibitRef } from "@/types"

/**
 * Deduplicate and stable-sort exhibit references.
 *
 * Deduplication uses filing-local identity key: `{accessionNo}:{sequence}`
 * - Retains first occurrence of each unique exhibit
 * - Assumes inputs are already normalized (accession hyphenated, type uppercase)
 * - Different from Phase 2 deduplication: filing-local (accessionNo:sequence)
 *   vs global (cik:accessionNo)
 *
 * Stable sort order:
 * 1. Primary: sequence NUMERIC ascending (10 comes after 2, not before)
 * 2. Secondary: filename STRING ascending (lexicographic)
 * 3. Preserves input order for ties
 *
 * CRITICAL: Sequence comparison is NUMERIC, not lexicographic.
 * - Lexicographic: "10" < "2" (wrong)
 * - Numeric: 10 > 2 (correct)
 *
 * @param exhibits - Array of exhibit references (may contain duplicates)
 * @returns Deduplicated, sorted array
 *
 * @example
 * const exhibits = [
 *   { accessionNo: "0001193125-20-123456", sequence: "10", filename: "ex10-1.htm", ... },
 *   { accessionNo: "0001193125-20-123456", sequence: "2", filename: "ex10-2.htm", ... },
 * ]
 * const result = dedupeAndSortExhibits(exhibits)
 * // result[0].sequence === "2" (not "10" — numeric sort)
 * // result[1].sequence === "10"
 */
export function dedupeAndSortExhibits(exhibits: ExhibitRef[]): ExhibitRef[] {
  // Build identity map: "{accessionNo}:{sequence}" → first occurrence
  const identityMap = new Map<string, ExhibitRef>()

  for (const exhibit of exhibits) {
    const identity = `${exhibit.accessionNo}:${exhibit.sequence}`

    // Retain first occurrence only
    if (!identityMap.has(identity)) {
      identityMap.set(identity, exhibit)
    }
    // If duplicate, skip (filing-local deduplication)
  }

  // Convert map values to array
  const deduplicated = Array.from(identityMap.values())

  // Stable sort: sequence NUMERIC ascending, then filename STRING ascending
  return deduplicated.sort((a, b) => {
    // Primary sort: sequence NUMERIC ascending
    const seqA = Number(a.sequence)
    const seqB = Number(b.sequence)
    if (seqA !== seqB) return seqA - seqB

    // Secondary sort: filename STRING ascending
    return a.filename.localeCompare(b.filename)
  })
}
