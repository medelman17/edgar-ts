import { EdgarClient } from "../src/index.js"

const client = new EdgarClient({
  userAgent: "EdgarTsExample/1.0 (michael@medelman.co)",
})

// Discover recent Apple filings
console.log("Discovering Apple (CIK 320193) filings...\n")

const filings = await client.discoverFilings({
  cik: "320193",
  from: "2025-01-01",
  to: "2025-12-31",
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

console.log("\nDone!")
