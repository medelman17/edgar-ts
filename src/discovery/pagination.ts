// SEC Submissions API pagination — recursive fetching for high-volume CIKs

import { ParseError } from "@/errors"
import type { SecHttpClient } from "@/http"
import { fetchSubmissionsResponse } from "./fetch-submissions"
import { normalizeCik } from "./normalization"
import type { FilingRecord, ParallelFilingArrays } from "./types"
import { recordsFromParallelArrays } from "./types"

/**
 * Fetch all filings for a CIK from SEC Submissions API with pagination.
 *
 * The SEC Submissions API returns the most recent 1000 filings in the `recent` array.
 * For CIKs with more than 1000 filings, additional filings are available via
 * the `files` array, which contains references to paginated JSON files.
 *
 * This function:
 * 1. Normalizes the CIK to 10-digit zero-padded format
 * 2. Fetches the primary submissions endpoint (data.sec.gov/submissions/CIK##########.json)
 * 3. Collects filings from the `recent` array
 * 4. Iterates through the `files` array to fetch paginated filing data
 * 5. Returns all filings as a single array
 *
 * @param cik - Central Index Key (padded or unpadded)
 * @param httpClient - SecHttpClient instance (for rate limiting and retry)
 * @returns Promise resolving to complete array of filing records
 * @throws ValidationError if CIK format is invalid
 * @throws TransportError if HTTP request fails (after retries)
 * @throws ParseError if response JSON is malformed
 *
 * @example
 * const filings = await fetchAllFilings("320193", httpClient)
 * console.log(`Total filings: ${filings.length}`)
 */
export async function fetchAllFilings(
  cik: string,
  httpClient: SecHttpClient,
  context?: { readonly operation: string; readonly endpointClass: string },
): Promise<FilingRecord[]> {
  const normalizedCik = normalizeCik(cik)

  const submissions = await fetchSubmissionsResponse(
    normalizedCik,
    httpClient,
    context ?? { operation: "discoverFilings", endpointClass: "submissions" },
  )

  // Collect recent filings (first 1000 or fewer)
  const allFilings: FilingRecord[] = recordsFromParallelArrays(submissions.filings.recent)

  // Iterate through paginated files
  const paginatedFiles = submissions.filings.files ?? []

  for (const file of paginatedFiles) {
    const fileUrl = `https://data.sec.gov/submissions/${file.name}`

    const paginatedResponse = (await httpClient.request(fileUrl, { context })) as unknown as {
      json(): Promise<unknown>
    }

    let paginatedData: Record<string, unknown>
    try {
      paginatedData = (await paginatedResponse.json()) as Record<string, unknown>
    } catch (error) {
      throw new ParseError(`Failed to parse paginated filings JSON from ${fileUrl}`, {
        metadata: { url: fileUrl, fileName: file.name },
        cause: error,
      })
    }

    const paginatedArrays = paginatedData as unknown as ParallelFilingArrays
    if (paginatedArrays.accessionNumber && Array.isArray(paginatedArrays.accessionNumber)) {
      allFilings.push(...recordsFromParallelArrays(paginatedArrays))
    }
  }

  return allFilings
}
