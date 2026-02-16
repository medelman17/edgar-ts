import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

describe("isolatedDeclarations compliance", () => {
  it("tsconfig.json enforces isolatedDeclarations: true", () => {
    const tsconfigPath = "tsconfig.json"
    expect(existsSync(tsconfigPath)).toBe(true)

    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"))
    expect(tsconfig.compilerOptions?.isolatedDeclarations).toBe(true)
  })

  it("tsconfig.json enforces declaration: true", () => {
    const tsconfigPath = "tsconfig.json"
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"))
    expect(tsconfig.compilerOptions?.declaration).toBe(true)
  })

  it("typecheck passes with isolatedDeclarations enabled", () => {
    // This will throw if typecheck fails (exit code non-zero)
    // TypeScript exits with 0 on success, no output expected
    expect(() => {
      execSync("pnpm typecheck", { encoding: "utf-8" })
    }).not.toThrow()
  })

  it("build emits .d.mts declaration file successfully", () => {
    // Run build to generate declaration files
    execSync("pnpm build", { encoding: "utf-8" })

    const dMtsPath = "dist/index.d.mts"
    expect(existsSync(dMtsPath)).toBe(true)

    // Verify the file contains export declarations
    const content = readFileSync(dMtsPath, "utf-8")
    expect(content).toContain("export")
    expect(content.length).toBeGreaterThan(0)
  })

  it("build emits .d.cts declaration file successfully", () => {
    execSync("pnpm build", { encoding: "utf-8" })

    const dCtsPath = "dist/index.d.cts"
    expect(existsSync(dCtsPath)).toBe(true)

    // Verify the file contains export declarations
    const content = readFileSync(dCtsPath, "utf-8")
    expect(content).toContain("export")
    expect(content.length).toBeGreaterThan(0)
  })

  it("generated .d.mts contains explicit type annotations", () => {
    execSync("pnpm build", { encoding: "utf-8" })

    const dMtsPath = "dist/index.d.mts"
    const content = readFileSync(dMtsPath, "utf-8")

    // Verify key exports are present with explicit types
    expect(content).toContain("EdgarClient")
    expect(content).toContain("EdgarClientOptions")
    expect(content).toContain("FilingRef")
    expect(content).toContain("ExhibitRef")
    expect(content).toContain("DownloadedExhibit")

    // Verify no "implicit any" patterns
    // isolatedDeclarations should prevent implicit any in output
    expect(content).not.toContain(": any")
  })

  it("generated declarations include all public types", () => {
    execSync("pnpm build", { encoding: "utf-8" })

    const dMtsPath = "dist/index.d.mts"
    const content = readFileSync(dMtsPath, "utf-8")

    // All public types from src/types/index.ts
    const requiredTypes = [
      "EdgarClientOptions",
      "RetryOptions",
      "TelemetryOptions",
      "RequestStartEvent",
      "RequestEndEvent",
      "RetryEvent",
      "DiscoverFilingsInput",
      "FilingRef",
      "ExhibitRef",
      "DownloadedExhibit",
    ]

    for (const typeName of requiredTypes) {
      expect(content).toContain(typeName)
    }
  })

  it("build with isolatedDeclarations produces no errors", () => {
    // Build should succeed without warnings or errors
    const output = execSync("pnpm build 2>&1", { encoding: "utf-8" })

    // Ensure no TypeScript errors in output
    expect(output.toLowerCase()).not.toContain("error ts")
    expect(output.toLowerCase()).not.toContain("implicit any")
  })
})
