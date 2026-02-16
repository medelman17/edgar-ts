// Filing index HTML parsing with custom table extraction (Node 18+ compatible)

import { ParseError } from "@/errors"
import type { RawExhibit } from "./types"

/**
 * Parse exhibit metadata from SEC filing index HTML.
 *
 * Uses custom string-based HTML parsing (NO DOMParser) for Node 18+ compatibility.
 * Extracts exhibit sequence, type, description, and filename from HTML table structure.
 *
 * **Parsing strategy:**
 * 1. Extract <table> block using regex
 * 2. Split into <tr> rows
 * 3. Extract <td> cells from each row
 * 4. Clean cell content (strip tags, decode entities, trim whitespace)
 * 5. Map cells to RawExhibit fields based on position
 * 6. Skip header rows (rows containing <th> tags)
 *
 * **Expected EDGAR table structure (example):**
 * ```html
 * <table class="tableFile">
 *   <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
 *   <tr>
 *     <td>1</td>
 *     <td>EMPLOYMENT AGREEMENT</td>
 *     <td><a href="/Archives/edgar/data/320193/000032019320000001/exhibit10-1.htm">exhibit10-1.htm</a></td>
 *     <td>EX-10.1</td>
 *     <td>12345</td>
 *   </tr>
 * </table>
 * ```
 *
 * **Cell mapping (0-indexed):**
 * - Cell 0: sequence
 * - Cell 1: description
 * - Cell 2: filename (extract from <a href="..."> if present, else text content)
 * - Cell 3: type
 * - Cell 4+: ignored (size, date, etc.)
 *
 * @param htmlContent - Raw HTML content from filing index
 * @returns Array of raw exhibit metadata (empty array if no exhibits found in table)
 * @throws ParseError if no table found or table structure is invalid
 *
 * @example
 * const html = await client.fetchFilingIndex(filing)
 * const exhibits = parseExhibitTableFromHtml(html)
 * // [{ sequence: "1", type: "EX-10.1", description: "...", filename: "..." }]
 */
export function parseExhibitTableFromHtml(htmlContent: string): RawExhibit[] {
  // Extract table block
  const tableMatch = htmlContent.match(/<table[\s\S]*?<\/table>/i)
  if (!tableMatch) {
    throw new ParseError("No table found in filing index HTML", {
      metadata: { htmlLength: htmlContent.length },
    })
  }

  const tableHtml = tableMatch[0]

  // Extract all rows
  const rowMatches = tableHtml.match(/<tr[\s\S]*?<\/tr>/gi)
  if (!rowMatches || rowMatches.length === 0) {
    throw new ParseError("No rows found in table", {
      metadata: { tableLength: tableHtml.length },
    })
  }

  const exhibits: RawExhibit[] = []

  for (const rowHtml of rowMatches) {
    // Skip header rows (contain <th> tags)
    if (/<th[\s\S]*?<\/th>/i.test(rowHtml)) {
      continue
    }

    // Extract cells
    const cellMatches = rowHtml.match(/<td[\s\S]*?<\/td>/gi)
    if (!cellMatches || cellMatches.length < 4) {
      // Skip rows with insufficient cells (may be malformed or separator rows)
      continue
    }

    // Clean cell content and map to fields
    const cells = cellMatches.map((cell) => cleanCellContent(cell))

    const sequence = cells[0]
    const description = cells[1]
    const filenameCell = cells[2]
    const type = cells[3]

    // Extract filename from <a href="..."> if present, else use cleaned text
    const filename = extractFilename(filenameCell, cellMatches[2])

    // Basic validation: sequence and type must be non-empty
    if (!sequence || !type) {
      continue
    }

    exhibits.push({
      sequence,
      filename,
      type,
      description: description || undefined,
    })
  }

  return exhibits
}

/**
 * Clean HTML cell content: strip tags, decode entities, trim whitespace.
 */
function cleanCellContent(cellHtml: string): string {
  // Strip all HTML tags
  let text = cellHtml.replace(/<[^>]+>/g, "")

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")

  // Trim whitespace
  return text.trim()
}

/**
 * Extract filename from cell HTML.
 *
 * Prefers href attribute from <a> tag, falls back to cleaned text content.
 */
function extractFilename(cleanedText: string, rawCellHtml: string): string {
  // Try to extract href from <a href="...">
  const hrefMatch = rawCellHtml.match(/<a[^>]*href="([^"]+)"/i)
  if (hrefMatch) {
    const href = hrefMatch[1]
    // Extract filename from path (e.g., "/Archives/.../ exhibit10-1.htm" → "exhibit10-1.htm")
    const pathParts = href.split("/")
    return pathParts[pathParts.length - 1] || cleanedText
  }

  // Fall back to cleaned text content
  return cleanedText
}
