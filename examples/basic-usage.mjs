import { EdgarClient } from "../dist/index.mjs"
import { createConsoleLogger, createMetricsAggregator } from "../dist/telemetry/index.mjs"

// Set up telemetry: console logger for real-time output + metrics aggregator for final stats
const metrics = createMetricsAggregator()
const consoleLogger = createConsoleLogger({ colors: true, timestamps: true })

const client = new EdgarClient({
  userAgent: "EdgarTsExample/1.0 (michael@medelman.co)",
  telemetry: {
    onRequestStart: (event) => {
      metrics.onRequestStart(event)
      consoleLogger.onRequestStart?.(event)
    },
    onRequestEnd: (event) => {
      metrics.onRequestEnd(event)
      consoleLogger.onRequestEnd?.(event)
    },
    onRetry: (event) => {
      metrics.onRetry?.(event)
      consoleLogger.onRetry?.(event)
    },
  },
})

// ============================================================================
// 1. Company Lookup — resolve ticker to CIK
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("1. COMPANY LOOKUP")
console.log("=".repeat(80))

const lookupResults = await client.lookupCompany("AAPL")
console.log(`\nLookup "AAPL": ${lookupResults.length} result(s)`)
for (const r of lookupResults) {
  console.log(`  CIK: ${r.cik}  Ticker: ${r.ticker}  Name: ${r.name}  Exchange: ${r.exchange}`)
}

const appleCik = lookupResults[0]?.cik ?? "0000320193"

// ============================================================================
// 2. Company Metadata — full company info from Submissions API
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("2. COMPANY METADATA")
console.log("=".repeat(80))

const companyInfo = await client.getCompanyInfo(appleCik)
console.log(`\n  Name:              ${companyInfo.name}`)
console.log(`  CIK:               ${companyInfo.cik}`)
console.log(`  Tickers:           ${companyInfo.tickers.join(", ") || "none"}`)
console.log(`  Exchanges:         ${companyInfo.exchanges.join(", ") || "none"}`)
console.log(`  SIC:               ${companyInfo.sic ?? "n/a"} (${companyInfo.sicDescription ?? "n/a"})`)
console.log(`  Entity Type:       ${companyInfo.entityType ?? "n/a"}`)
console.log(`  State of Incorp:   ${companyInfo.stateOfIncorporation ?? "n/a"}`)
console.log(`  Fiscal Year End:   ${companyInfo.fiscalYearEnd ?? "n/a"}`)

// ============================================================================
// 3. Filing Discovery (CIK-scoped) — per-company via Submissions API
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("3. FILING DISCOVERY (CIK-scoped)")
console.log("=".repeat(80))

const filings = await client.discoverFilings({
  cik: appleCik,
  from: "2024-01-01",
  to: "2024-12-31",
})

console.log(`\nFound ${filings.length} Apple filings in 2024:\n`)
for (const f of filings.slice(0, 8)) {
  console.log(`  ${f.filingDate}  ${f.formType.padEnd(10)} ${f.accessionNo}`)
}
if (filings.length > 8) console.log(`  ... and ${filings.length - 8} more`)

// ============================================================================
// 4. Index File Discovery (no CIK) — broad discovery via quarterly index
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("4. INDEX FILE DISCOVERY (all filers, one quarter)")
console.log("=".repeat(80))

// Discover all 10-K filings across ALL filers for one month
const indexFilings = await client.discoverFilings({
  from: "2024-10-01",
  to: "2024-10-31",
  formTypes: ["10-K"],
})

console.log(`\nFound ${indexFilings.length} 10-K filings across all filers in Oct 2024`)
for (const f of indexFilings.slice(0, 5)) {
  console.log(`  ${f.filingDate}  CIK ${f.cik}  ${f.accessionNo}`)
}
if (indexFilings.length > 5) console.log(`  ... and ${indexFilings.length - 5} more`)

// ============================================================================
// 5. Exhibits & Download
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("5. EXHIBITS & DOWNLOAD")
console.log("=".repeat(80))

const filing = filings.find((f) => f.formType === "10-K" || f.formType === "10-Q") ?? filings[0]
if (filing) {
  const exhibits = await client.listExhibits(filing)
  const contracts = await client.listContractExhibits(filing)

  console.log(`\nExhibits for ${filing.formType} filed ${filing.filingDate}:`)
  console.log(`  Total exhibits: ${exhibits.length}`)
  console.log(`  Contract exhibits (EX-10*): ${contracts.length}`)

  for (const ex of exhibits.slice(0, 5)) {
    console.log(`  Seq ${ex.sequence.padEnd(4)} ${ex.type.padEnd(14)} ${ex.filename}`)
  }

  if (exhibits.length > 0) {
    const target = exhibits[0]
    console.log(`\nDownloading: ${target.filename}...`)
    const downloaded = await client.downloadExhibit(target)
    console.log(`  Size:    ${downloaded.sizeBytes} bytes`)
    console.log(`  SHA-256: ${downloaded.sha256}`)
    console.log(`  MIME:    ${downloaded.mimeType ?? "unknown"}`)
    const preview = new TextDecoder().decode(downloaded.bytes.slice(0, 200)).replace(/\n/g, " ").slice(0, 150)
    console.log(`  Preview: ${preview}...`)
  }
}

// ============================================================================
// 6. XBRL Financial Data
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("6. XBRL FINANCIAL DATA")
console.log("=".repeat(80))

// Company Facts — overview of all XBRL data
const facts = await client.getCompanyFacts(appleCik)
const taxonomies = Object.keys(facts.facts)
const totalTags = taxonomies.reduce((sum, t) => sum + Object.keys(facts.facts[t]).length, 0)
console.log(`\n  ${facts.entityName} XBRL Facts:`)
console.log(`  Taxonomies: ${taxonomies.join(", ")}`)
console.log(`  Total tags: ${totalTags}`)

// Company Concept — Revenue time series
const revenue = await client.getCompanyConcept(appleCik, "us-gaap", "Revenues")
const annualRevenue = (revenue.units.USD ?? []).filter((v) => v.fp === "FY" && v.form === "10-K")
console.log(`\n  Revenue (annual, 10-K):`)
for (const v of annualRevenue.slice(-5)) {
  console.log(`    FY${v.fy}: $${(v.val / 1e9).toFixed(1)}B`)
}

// Frame — cross-company comparison
const frame = await client.getFrame("us-gaap", "Revenues", "USD", "CY2023")
console.log(`\n  Cross-company Revenue (CY2023):`)
console.log(`  ${frame.data?.length ?? 0} companies reported`)
const topRevenue = (frame.data ?? []).sort((a, b) => b.val - a.val).slice(0, 5)
for (const entry of topRevenue) {
  console.log(`    ${entry.entityName?.slice(0, 30).padEnd(30)} $${(entry.val / 1e9).toFixed(1)}B`)
}

// ============================================================================
// 7. Full-Text Search (EFTS)
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("7. FULL-TEXT SEARCH (EFTS)")
console.log("=".repeat(80))

const searchResults = await client.searchFilings({
  q: '"non-compete agreement"',
  formTypes: ["10-K"],
  from: "2024-01-01",
  to: "2024-12-31",
})

console.log(`\nSearch: "non-compete agreement" in 10-K filings (2024)`)
console.log(`  Total results: ${searchResults.total}`)
for (const hit of searchResults.hits.slice(0, 5)) {
  console.log(`  ${hit.fileDate}  ${hit.entityName?.slice(0, 40)}  (${hit.formType})`)
}
if (searchResults.hits.length > 5) console.log(`  ... and ${searchResults.total - 5} more`)

// ============================================================================
// Metrics Summary
// ============================================================================

console.log("\n" + "=".repeat(80))
console.log("METRICS SUMMARY")
console.log("=".repeat(80))

const snapshot = metrics.getSnapshot()
console.log(`\n  Runtime:                ${snapshot.runtime}`)
console.log(`  Total Requests:         ${snapshot.requestsTotal}`)
console.log(`  Successful:             ${snapshot.requestsSuccessful}`)
console.log(`  Failed:                 ${snapshot.requestsFailed}`)
console.log(`  Retries:                ${snapshot.retriesTotal}`)
console.log(`  Rate Limited:           ${snapshot.rateLimitedRequests}`)

if (Object.keys(snapshot.latencyByOperation).length > 0) {
  console.log(`\n  Latency by Operation:`)
  for (const [op, stats] of Object.entries(snapshot.latencyByOperation)) {
    console.log(`    ${op.padEnd(25)} count=${stats.count}  min=${stats.min.toFixed(0)}ms  avg=${stats.avg.toFixed(0)}ms  max=${stats.max.toFixed(0)}ms`)
  }
}

console.log("\n" + "=".repeat(80))
console.log("Done!")
console.log("=".repeat(80) + "\n")
