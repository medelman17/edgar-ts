// DiscoveryService — orchestrates filing discovery with normalization and deduplication

import { ConfigurationError, ValidationError } from "@/errors"
import type { SecHttpClient } from "@/http"
import type { DiscoverFilingsInput, FilingRef } from "@/types"
import { dedupeAndSort } from "./deduplication"
import {
  normalizeAccession,
  normalizeCik,
  normalizeFormType,
  validateDate,
} from "./normalization"
import { fetchAllFilings } from "./pagination"

/**
 * Default form types for filing discovery.
 *
 * Includes core forms (8-K, 10-K, 10-Q, 20-F, S-1) and their amendment variants.
 * Amendments are separate submissions with distinct contract exhibits, and users
 * typically want both original and amended filings for comprehensive discovery.
 */
const DEFAULT_FORM_TYPES = [
  "8-K",
  "10-K",
  "10-Q",
  "20-F",
  "S-1",
  "8-K/A",
  "10-K/A",
  "10-Q/A",
  "20-F/A",
  "S-1/A",
]

/**
 * DiscoveryService orchestrates filing discovery flow:
 *
 * 1. Input validation (dates, CIK, form types)
 * 2. Fetch filings from SEC Submissions API
 * 3. Filter by date range and form types
 * 4. Normalize filings to canonical format
 * 5. Deduplicate and stable-sort
 *
 * All HTTP requests route through SecHttpClient for rate limiting,
 * retry, and timeout handling.
 */
export class DiscoveryService {
  constructor(private readonly httpClient: SecHttpClient) {}

  /**
   * Discover filings within date range with optional CIK and form type filters.
   *
   * @param input - Discovery parameters (from, to, optional cik, optional formTypes)
   * @returns Promise resolving to normalized, deduplicated, sorted FilingRef array
   * @throws ValidationError if dates are invalid or reversed
   * @throws ConfigurationError if CIK not provided (Daily Index not yet supported)
   * @throws TransportError if HTTP request fails (after retries)
   * @throws ParseError if response JSON is malformed
   *
   * @example
   * const filings = await service.discoverFilings({
   *   cik: "320193",
   *   from: "2024-01-01",
   *   to: "2024-12-31"
   * })
   */
  async discoverFilings(input: DiscoverFilingsInput): Promise<FilingRef[]> {
    // 1. Input validation
    validateDate(input.from)
    validateDate(input.to)

    // Verify from <= to
    if (input.from > input.to) {
      throw new ValidationError("Date range invalid: 'from' must be <= 'to'", {
        metadata: { from: input.from, to: input.to },
      })
    }

    // Normalize CIK if provided
    let normalizedCik: string | undefined
    if (input.cik) {
      normalizedCik = normalizeCik(input.cik)
    }

    // Default and normalize form types
    const formTypes = input.formTypes ?? DEFAULT_FORM_TYPES
    const normalizedFormTypes = formTypes.map((form) => normalizeFormType(form))

    // 2. Fetch filings
    if (!normalizedCik) {
      // Daily Index Files not yet implemented
      throw new ConfigurationError(
        "Discovery without CIK requires Daily Index Files (planned for future release)",
        {
          metadata: {
            feature: "daily-index-discovery",
            status: "not-implemented",
          },
        },
      )
    }

    const rawFilings = await fetchAllFilings(normalizedCik, this.httpClient)

    // 3. Filter by date range
    const dateFiltered = rawFilings.filter((filing) => {
      // ISO 8601 dates are lexicographically comparable
      return filing.filingDate >= input.from && filing.filingDate <= input.to
    })

    // 4. Filter by form types
    const formFiltered = dateFiltered.filter((filing) => {
      const normalized = normalizeFormType(filing.form)
      return normalizedFormTypes.includes(normalized)
    })

    // 5. Normalize filings to FilingRef
    const normalizedFilings = formFiltered.map((filing) => {
      // Normalize CIK from response (may be unpadded)
      const filingCik = normalizeCik(normalizedCik)
      const filingAccession = normalizeAccession(filing.accessionNumber)
      const filingFormType = normalizeFormType(filing.form)

      // Build filing URL using SEC viewer
      // Format: https://www.sec.gov/cgi-bin/viewer?action=view&cik={cik}&accession_number={accessionNoCompact}&xbrl_type=v
      const accessionNoCompact = filingAccession.replace(/-/g, "")
      const filingUrl = `https://www.sec.gov/cgi-bin/viewer?action=view&cik=${filingCik}&accession_number=${accessionNoCompact}&xbrl_type=v`

      const ref: FilingRef = {
        cik: filingCik,
        accessionNo: filingAccession,
        formType: filingFormType,
        filingDate: filing.filingDate,
        filingUrl,
      }

      return ref
    })

    // 6. Deduplicate and sort
    return dedupeAndSort(normalizedFilings)
  }
}
