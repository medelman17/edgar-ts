// Tests for exhibit HTML parsing

import { describe, expect, it } from "vitest"
import { ParseError } from "@/errors"
import { parseExhibitTableFromHtml } from "@/exhibits/parsing"

describe("parseExhibitTableFromHtml", () => {
  describe("valid tables", () => {
    it("parses real EDGAR table structure with all fields", () => {
      const html = `
        <table class="tableFile">
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th><th>Size</th></tr>
          <tr>
            <td>1</td>
            <td>EMPLOYMENT AGREEMENT</td>
            <td><a href="/Archives/edgar/data/320193/000032019320000001/exhibit10-1.htm">exhibit10-1.htm</a></td>
            <td>EX-10.1</td>
            <td>12345</td>
          </tr>
          <tr>
            <td>2</td>
            <td>CREDIT AGREEMENT</td>
            <td><a href="/Archives/edgar/data/320193/000032019320000001/exhibit10-2.htm">exhibit10-2.htm</a></td>
            <td>EX-10.2</td>
            <td>67890</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(2)
      expect(exhibits[0]).toEqual({
        sequence: "1",
        type: "EX-10.1",
        description: "EMPLOYMENT AGREEMENT",
        filename: "exhibit10-1.htm",
      })
      expect(exhibits[1]).toEqual({
        sequence: "2",
        type: "EX-10.2",
        description: "CREDIT AGREEMENT",
        filename: "exhibit10-2.htm",
      })
    })

    it("parses table with multiple exhibits including variations", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>001</td>
            <td>Lease Agreement</td>
            <td><a href="/path/to/ex10_1.htm">ex10_1.htm</a></td>
            <td>EX_10.1</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Amendment to Lease</td>
            <td><a href="/path/to/ex10_2.htm">ex10_2.htm</a></td>
            <td>EX/10.2</td>
          </tr>
          <tr>
            <td>3</td>
            <td>Consent and Waiver</td>
            <td><a href="/path/to/ex99.htm">ex99.htm</a></td>
            <td>EX-99</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(3)
      expect(exhibits[0].sequence).toBe("001")
      expect(exhibits[0].type).toBe("EX_10.1")
      expect(exhibits[1].type).toBe("EX/10.2")
      expect(exhibits[2].type).toBe("EX-99")
    })

    it("extracts filename from href attribute", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Test Document</td>
            <td><a href="/Archives/edgar/data/1234/000123420000001/filename-with-dashes.htm">link text</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].filename).toBe("filename-with-dashes.htm")
    })

    it("falls back to text content when no href present", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Test Document</td>
            <td>plaintext-filename.htm</td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].filename).toBe("plaintext-filename.htm")
    })

    it("handles empty description as undefined", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td></td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].description).toBeUndefined()
    })

    it("handles whitespace-only description as undefined", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>   </td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].description).toBeUndefined()
    })

    it("returns empty array for table with only header row", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toEqual([])
    })
  })

  describe("HTML entity decoding", () => {
    it("decodes common HTML entities in description", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Agreement &amp; Consent &lt;Amended&gt;</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].description).toBe("Agreement & Consent <Amended>")
    })

    it("decodes &quot; and &#39; entities", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>&quot;Special&quot; Terms &#39;Agreement&#39;</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].description).toBe('"Special" Terms \'Agreement\'')
    })

    it("decodes &nbsp; to space", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Agreement&nbsp;with&nbsp;Spacing</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].description).toBe("Agreement with Spacing")
    })
  })

  describe("whitespace handling", () => {
    it("trims leading and trailing whitespace from all fields", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>  1  </td>
            <td>  Test Document  </td>
            <td><a href="/path/file.htm">  file.htm  </a></td>
            <td>  EX-10  </td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].sequence).toBe("1")
      expect(exhibits[0].description).toBe("Test Document")
      expect(exhibits[0].filename).toBe("file.htm")
      expect(exhibits[0].type).toBe("EX-10")
    })

    it("handles newlines and tabs in cell content", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>
              1
            </td>
            <td>
              Multi
              Line
              Description
            </td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits[0].sequence).toBe("1")
      // Multiple whitespace characters collapsed to single space, then trimmed
      expect(exhibits[0].description).toContain("Multi")
    })
  })

  describe("header row detection", () => {
    it("skips rows with <th> tags", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr><th colspan="4">Section Header</th></tr>
          <tr>
            <td>1</td>
            <td>Test Document</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("1")
    })

    it("skips mixed <th>/<td> rows", () => {
      const html = `
        <table>
          <tr><th>Seq</th><td>Mixed Row</td><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Test Document</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("1")
    })
  })

  describe("malformed input handling", () => {
    it("skips rows with fewer than 4 cells", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>Incomplete Row</td>
          </tr>
          <tr>
            <td>2</td>
            <td>Valid Row</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("2")
    })

    it("skips rows with empty sequence", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td></td>
            <td>No Sequence</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td>EX-10</td>
          </tr>
          <tr>
            <td>1</td>
            <td>Valid Row</td>
            <td><a href="/path/file2.htm">file2.htm</a></td>
            <td>EX-11</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("1")
    })

    it("skips rows with empty type", () => {
      const html = `
        <table>
          <tr><th>Seq</th><th>Description</th><th>Document</th><th>Type</th></tr>
          <tr>
            <td>1</td>
            <td>No Type</td>
            <td><a href="/path/file.htm">file.htm</a></td>
            <td></td>
          </tr>
          <tr>
            <td>2</td>
            <td>Valid Row</td>
            <td><a href="/path/file2.htm">file2.htm</a></td>
            <td>EX-10</td>
          </tr>
        </table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("2")
    })

    it("throws ParseError when no table found", () => {
      const html = "<div>No table here</div>"

      expect(() => parseExhibitTableFromHtml(html)).toThrow(ParseError)
      expect(() => parseExhibitTableFromHtml(html)).toThrow("No table found in filing index HTML")
    })

    it("throws ParseError when table has no rows", () => {
      const html = "<table></table>"

      expect(() => parseExhibitTableFromHtml(html)).toThrow(ParseError)
      expect(() => parseExhibitTableFromHtml(html)).toThrow("No rows found in table")
    })
  })

  describe("case-insensitive tag matching", () => {
    it("handles uppercase TABLE tags", () => {
      const html = `
        <TABLE>
          <TR><TH>Seq</TH><TH>Description</TH><TH>Document</TH><TH>Type</TH></TR>
          <TR>
            <TD>1</TD>
            <TD>Test Document</TD>
            <TD><A HREF="/path/file.htm">file.htm</A></TD>
            <TD>EX-10</TD>
          </TR>
        </TABLE>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("1")
    })

    it("handles mixed case tags", () => {
      const html = `
        <Table>
          <Tr><Th>Seq</Th><Th>Description</Th><Th>Document</Th><Th>Type</Th></Tr>
          <Tr>
            <Td>1</Td>
            <Td>Test Document</Td>
            <Td><a href="/path/file.htm">file.htm</a></Td>
            <Td>EX-10</Td>
          </Tr>
        </Table>
      `

      const exhibits = parseExhibitTableFromHtml(html)

      expect(exhibits).toHaveLength(1)
      expect(exhibits[0].sequence).toBe("1")
    })
  })
})
