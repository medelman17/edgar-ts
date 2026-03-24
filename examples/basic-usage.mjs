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

// Discover filings from the last 10 years
const today = new Date()
const tenYearsAgo = new Date()
tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10)

const from = tenYearsAgo.toISOString().split("T")[0]
const to = today.toISOString().split("T")[0]

console.log(`\n🔍 Discovering Apple (CIK 320193) filings from ${from} to ${to}...\n`)

const filings = await client.discoverFilings({
  cik: "320193",
  from,
  to,
})

console.log(`Found ${filings.length} filings:\n`)
for (const f of filings.slice(0, 5)) {
  console.log(`  ${f.filingDate}  ${f.formType.padEnd(10)} ${f.accessionNo}`)
}
if (filings.length > 5) console.log(`  ... and ${filings.length - 5} more\n`)

// Find a 10-Q or 10-K filing (more likely to have exhibits)
const filing = filings.find((f) => f.formType === "10-Q" || f.formType === "10-K") ?? filings[0]
if (!filing) {
  console.log("No filings found.")
  process.exit(0)
}

console.log(`\nExhibits for ${filing.formType} filed ${filing.filingDate}:`)
const exhibits = await client.listExhibits(filing)
console.log(`  Total exhibits: ${exhibits.length}`)
for (const ex of exhibits.slice(0, 5)) {
  console.log(`  Seq ${ex.sequence.padEnd(4)} ${ex.type.padEnd(12)} ${ex.filename}`)
}

// List contract exhibits
const contracts = await client.listContractExhibits(filing)
console.log(`\n  Contract exhibits (EX-10*): ${contracts.length}`)

// Download first exhibit (any type) to test the full pipeline
if (exhibits.length > 0) {
  const target = exhibits[0]
  console.log(`\nDownloading exhibit: ${target.filename}...`)
  const downloaded = await client.downloadExhibit(target)
  console.log(`  Size: ${downloaded.sizeBytes} bytes`)
  console.log(`  SHA-256: ${downloaded.sha256}`)
  console.log(`  MIME: ${downloaded.mimeType ?? "unknown"}`)
  console.log(`  First 200 chars: ${new TextDecoder().decode(downloaded.bytes.slice(0, 200)).replace(/\n/g, " ").slice(0, 200)}`)
}

// Print final metrics summary
console.log("\n" + "=".repeat(80))
console.log("📊 Final Metrics Summary")
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
    console.log(`    ${op}:`)
    console.log(`      Count:   ${stats.count}`)
    console.log(`      Min:     ${stats.min.toFixed(2)}ms`)
    console.log(`      Max:     ${stats.max.toFixed(2)}ms`)
    console.log(`      Avg:     ${stats.avg.toFixed(2)}ms`)
  }
}

console.log("\n" + "=".repeat(80))
console.log("✅ Done!")
console.log("=".repeat(80) + "\n")
