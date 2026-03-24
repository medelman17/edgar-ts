// Shared utility for fetching SEC Submissions API response

import { ParseError } from "@/errors"
import type { SecHttpClient } from "@/http"
import { normalizeCik } from "./normalization"
import type { SubmissionsResponse } from "./types"

/**
 * Fetch the SEC Submissions API response for a given CIK.
 *
 * Used by both CompanyService (for metadata) and DiscoveryService (for filings).
 */
export async function fetchSubmissionsResponse(
  cik: string,
  httpClient: SecHttpClient,
  context: { readonly operation: string; readonly endpointClass: string },
): Promise<SubmissionsResponse> {
  const normalizedCik = normalizeCik(cik)
  const url = `https://data.sec.gov/submissions/CIK${normalizedCik}.json`

  const response = (await httpClient.request(url, { context })) as unknown as {
    json(): Promise<unknown>
  }

  try {
    return (await response.json()) as SubmissionsResponse
  } catch (error) {
    throw new ParseError(`Failed to parse submissions JSON from ${url}`, {
      metadata: { url, cik: normalizedCik },
      cause: error,
    })
  }
}
