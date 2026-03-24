// Shared utility for fetching SEC Submissions API response

import type { SecHttpClient } from "@/http"
import { fetchJson } from "@/http/fetch-json"
import type { SubmissionsResponse } from "./types"

/**
 * Fetch the SEC Submissions API response for a given CIK.
 * Expects a pre-normalized 10-digit CIK.
 */
export async function fetchSubmissionsResponse(
  normalizedCik: string,
  httpClient: SecHttpClient,
  context: { readonly operation: string; readonly endpointClass: string },
): Promise<SubmissionsResponse> {
  const url = `https://data.sec.gov/submissions/CIK${normalizedCik}.json`
  return fetchJson<SubmissionsResponse>(url, httpClient, context)
}
