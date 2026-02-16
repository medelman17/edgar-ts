// Internal types for exhibit parsing

/**
 * Raw exhibit metadata extracted from SEC filing index HTML.
 *
 * This is intermediate output from parseExhibitTableFromHtml() before normalization.
 * Fields retain their original string format from the HTML table.
 *
 * @see parseExhibitTableFromHtml
 */
export type RawExhibit = {
  /** Exhibit sequence number (as-is from HTML, may have leading zeros or whitespace) */
  sequence: string
  /** Exhibit filename (extracted from href or cell text) */
  filename: string
  /** Exhibit type code (e.g., "EX-10.1", "ex_10", "EX/10") */
  type: string
  /** Optional exhibit description from filing index */
  description?: string
}
