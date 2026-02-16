// Internal discovery types — SEC Submissions API response structures

/**
 * Filing record from SEC Submissions API
 */
export type FilingRecord = {
  /** Accession number (hyphenated format: ##########-##-######) */
  accessionNumber: string
  /** Filing date (YYYY-MM-DD) */
  filingDate: string
  /** Report date (YYYY-MM-DD) */
  reportDate: string
  /** Acceptance timestamp (ISO 8601) */
  acceptanceDateTime: string
  /** Securities Act variant ("33", "34", "40") */
  act: string
  /** Form type (e.g., "10-K", "8-K/A") */
  form: string
  /** File number */
  fileNumber: string
  /** Primary document filename */
  primaryDocument: string
  /** Primary document description */
  primaryDocDescription?: string
  /** File size in bytes */
  size: number
  /** Whether filing is XBRL (0 or 1) */
  isXBRL: number
  /** Whether filing is inline XBRL (0 or 1) */
  isInlineXBRL: number
}

/**
 * Paginated file reference in filings.files array
 */
export type PaginatedFileRef = {
  /** Relative path to paginated JSON file (e.g., "submissions/CIK0000320193-submissions-001.json") */
  name: string
  /** Number of filings in this paginated file */
  filingCount: number
  /** Starting filing date (YYYY-MM-DD) */
  filingFrom?: string
  /** Ending filing date (YYYY-MM-DD) */
  filingTo?: string
}

/**
 * Response from SEC Submissions API (data.sec.gov/submissions/CIK##########.json)
 */
export type SubmissionsResponse = {
  /** CIK as string (may or may not be zero-padded) */
  cik: string
  /** Entity name */
  name: string
  /** Trading symbols */
  tickers?: string[]
  /** Entity type */
  entityType?: string
  /** SIC code */
  sic?: string
  /** SIC description */
  sicDescription?: string
  /** Fiscal year end (MMDD format) */
  fiscalYearEnd?: string
  /** Filings collection */
  filings: {
    /** Most recent filings as parallel arrays (up to 1000 entries per array) */
    recent: ParallelFilingArrays
    /** References to paginated filing files (for CIKs with 1000+ filings) */
    files: PaginatedFileRef[]
  }
}

/**
 * SEC API parallel-array format for filing data.
 * The SEC Submissions API returns filings as an object with parallel arrays
 * (one array per field), not as an array of objects.
 */
export type ParallelFilingArrays = {
  accessionNumber: string[]
  filingDate: string[]
  reportDate: string[]
  acceptanceDateTime: string[]
  act: string[]
  form: string[]
  fileNumber: string[]
  primaryDocument: string[]
  primaryDocDescription: string[]
  size: number[]
  isXBRL: number[]
  isInlineXBRL: number[]
}

/**
 * Reconstruct FilingRecord[] from SEC parallel-array format.
 */
export function recordsFromParallelArrays(arrays: ParallelFilingArrays): FilingRecord[] {
  const len = arrays.accessionNumber?.length ?? 0
  const records: FilingRecord[] = []
  for (let i = 0; i < len; i++) {
    records.push({
      accessionNumber: arrays.accessionNumber[i] ?? "",
      filingDate: arrays.filingDate[i] ?? "",
      reportDate: arrays.reportDate[i] ?? "",
      acceptanceDateTime: arrays.acceptanceDateTime[i] ?? "",
      act: arrays.act[i] ?? "",
      form: arrays.form[i] ?? "",
      fileNumber: arrays.fileNumber[i] ?? "",
      primaryDocument: arrays.primaryDocument[i] ?? "",
      primaryDocDescription: arrays.primaryDocDescription[i],
      size: arrays.size[i] ?? 0,
      isXBRL: arrays.isXBRL[i] ?? 0,
      isInlineXBRL: arrays.isInlineXBRL[i] ?? 0,
    })
  }
  return records
}
