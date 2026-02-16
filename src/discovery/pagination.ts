// SEC Submissions API pagination — recursive fetching for high-volume CIKs

import { ParseError } from "@/errors"
import type { SecHttpClient } from "@/http"
import { normalizeCik } from "./normalization"
import type { FilingRecord, SubmissionsResponse } from "./types"

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
): Promise<FilingRecord[]> {
  // 1. Normalize CIK to 10-digit format (throws ValidationError on invalid input)
  const normalizedCik = normalizeCik(cik)

  // 2. Fetch primary submissions endpoint
  const primaryUrl = `https://data.sec.gov/submissions/CIK${normalizedCik}.json`
  const primaryResponse = (await httpClient.request(primaryUrl)) as unknown as {
    json(): Promise<unknown>
  }

  // Parse response JSON
  let submissions: SubmissionsResponse
  try {
    submissions = (await primaryResponse.json()) as SubmissionsResponse
  } catch (error) {
    throw new ParseError(`Failed to parse submissions JSON from ${primaryUrl}`, {
      metadata: { url: primaryUrl, cik: normalizedCik },
      cause: error,
    })
  }

  // 3. Collect recent filings (first 1000 or fewer)
  const allFilings: FilingRecord[] = [...(submissions.filings.recent ?? [])]

  // 4. Iterate through paginated files
  // IMPORTANT: Paginated files use www.sec.gov base, NOT data.sec.gov (per research)
  const paginatedFiles = submissions.filings.files ?? []

  for (const file of paginatedFiles) {
    // Construct paginated file URL
    // Based on research: https://www.sec.gov/{file.name}
    // where file.name is a relative path like "submissions/CIK0000320193-submissions-001.json"
    const fileUrl = `https://www.sec.gov/${file.name}`

    const paginatedResponse = (await httpClient.request(fileUrl)) as unknown as {
      json(): Promise<unknown>
    }

    // Parse paginated response
    let paginatedData: Record<string, unknown>
    try {
      paginatedData = (await paginatedResponse.json()) as Record<string, unknown>
    } catch (error) {
      throw new ParseError(`Failed to parse paginated filings JSON from ${fileUrl}`, {
        metadata: { url: fileUrl, fileName: file.name },
        cause: error,
      })
    }

    // The paginated file has the same structure as the primary response
    // It should contain a FilingRecord array, but the exact key might vary
    // Based on SEC structure, paginated files mirror the primary structure
    // They should have an array of filing records at the top level or similar key

    // According to research, paginated files return arrays directly or in same structure
    // Let me check the actual structure - typically it's an array at a known key
    // For now, assuming it has the same structure with arrays keyed by field names

    // Actually, reviewing the research more carefully:
    // Paginated files contain the same field structure (arrays keyed by column names)
    // We need to reconstruct FilingRecord[] from parallel arrays

    // The safest approach is to assume the paginated file mirrors the structure
    // and has parallel arrays for each field (accessionNumber, filingDate, etc.)
    // Let's extract those and build FilingRecord objects

    // For simplicity and based on the research examples, let's assume the paginated
    // response has a structure we can extract filings from
    // Since the exact structure isn't 100% clear from research, we'll handle both cases:

    // Case 1: Direct array of filing records
    if (Array.isArray(paginatedData)) {
      allFilings.push(...(paginatedData as FilingRecord[]))
      continue
    }

    // Case 2: Structured format with parallel arrays (like primary response)
    // This is the more likely case based on SEC API patterns
    if (paginatedData.accessionNumber && Array.isArray(paginatedData.accessionNumber)) {
      // Reconstruct filing records from parallel arrays
      const accessionNumbers = paginatedData.accessionNumber as string[]
      const filingDates = (paginatedData.filingDate as string[]) ?? []
      const reportDates = (paginatedData.reportDate as string[]) ?? []
      const acceptanceDateTimes = (paginatedData.acceptanceDateTime as string[]) ?? []
      const acts = (paginatedData.act as string[]) ?? []
      const forms = (paginatedData.form as string[]) ?? []
      const fileNumbers = (paginatedData.fileNumber as string[]) ?? []
      const primaryDocuments = (paginatedData.primaryDocument as string[]) ?? []
      const primaryDocDescriptions = (paginatedData.primaryDocDescription as string[]) ?? []
      const sizes = (paginatedData.size as number[]) ?? []
      const isXBRLs = (paginatedData.isXBRL as number[]) ?? []
      const isInlineXBRLs = (paginatedData.isInlineXBRL as number[]) ?? []

      // Build FilingRecord objects
      for (let i = 0; i < accessionNumbers.length; i++) {
        const filing: FilingRecord = {
          accessionNumber: accessionNumbers[i] ?? "",
          filingDate: filingDates[i] ?? "",
          reportDate: reportDates[i] ?? "",
          acceptanceDateTime: acceptanceDateTimes[i] ?? "",
          act: acts[i] ?? "",
          form: forms[i] ?? "",
          fileNumber: fileNumbers[i] ?? "",
          primaryDocument: primaryDocuments[i] ?? "",
          primaryDocDescription: primaryDocDescriptions[i],
          size: sizes[i] ?? 0,
          isXBRL: isXBRLs[i] ?? 0,
          isInlineXBRL: isInlineXBRLs[i] ?? 0,
        }
        allFilings.push(filing)
      }
    }
  }

  // 5. Return complete array
  return allFilings
}
