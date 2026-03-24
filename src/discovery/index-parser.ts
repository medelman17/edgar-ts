// Parse SEC EDGAR master.idx index files (pipe-delimited)

import { normalizeCik, normalizeFormType } from "./normalization"

export type IndexEntry = {
  cik: string
  companyName: string
  formType: string
  filingDate: string
  filename: string
}

/**
 * Parse a SEC master.idx file into structured entries.
 *
 * Format: CIK|Company Name|Form Type|Date Filed|Filename
 * First line is a header, second line is dashes. Both are skipped.
 * Malformed rows are silently skipped.
 */
export function parseIndexFile(content: string): IndexEntry[] {
  const lines = content.split("\n")
  const entries: IndexEntry[] = []

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("-") || trimmed.startsWith("CIK|")) {
      continue
    }

    const parts = trimmed.split("|")
    if (parts.length < 5) {
      continue
    }

    const rawCik = parts[0] ?? ""
    const companyName = parts[1] ?? ""
    const formType = parts[2] ?? ""
    const filingDate = parts[3] ?? ""
    const filename = parts[4] ?? ""

    // Skip rows where CIK is not numeric
    if (!/^\d+$/.test(rawCik.trim())) {
      continue
    }

    entries.push({
      cik: normalizeCik(rawCik.trim()),
      companyName: companyName.trim(),
      formType: normalizeFormType(formType.trim()),
      filingDate: filingDate.trim(),
      filename: filename.trim(),
    })
  }

  return entries
}
