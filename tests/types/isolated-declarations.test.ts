import { execSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// rolldown (used by tsdown) requires Node 20+ (uses node:util.styleText)
const nodeVersion = Number(process.versions.node.split(".")[0])
const describeBuild = nodeVersion >= 20 ? describe : describe.skip

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
    expect(() => {
      execSync("pnpm typecheck", { encoding: "utf-8" })
    }).not.toThrow()
  })

  describeBuild("build output (requires Node 20+)", () => {
    it("build emits .d.mts declaration file successfully", () => {
      execSync("pnpm build", { encoding: "utf-8" })

      const dMtsPath = "dist/index.d.mts"
      expect(existsSync(dMtsPath)).toBe(true)

      const content = readFileSync(dMtsPath, "utf-8")
      expect(content).toContain("export")
      expect(content.length).toBeGreaterThan(0)
    })

    it("build emits .d.cts declaration file successfully", () => {
      execSync("pnpm build", { encoding: "utf-8" })

      const dCtsPath = "dist/index.d.cts"
      expect(existsSync(dCtsPath)).toBe(true)

      const content = readFileSync(dCtsPath, "utf-8")
      expect(content).toContain("export")
      expect(content.length).toBeGreaterThan(0)
    })

    it("generated .d.mts contains explicit type annotations", () => {
      execSync("pnpm build", { encoding: "utf-8" })

      const dMtsPath = "dist/index.d.mts"
      const content = readFileSync(dMtsPath, "utf-8")

      expect(content).toContain("EdgarClient")
      expect(content).toContain("EdgarClientOptions")
      expect(content).toContain("FilingRef")
      expect(content).toContain("ExhibitRef")
      expect(content).toContain("DownloadedExhibit")

      expect(content).not.toContain(": any")
    })

    it("generated declarations include all public types", () => {
      execSync("pnpm build", { encoding: "utf-8" })

      const dMtsPath = "dist/index.d.mts"
      const content = readFileSync(dMtsPath, "utf-8")

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
      const output = execSync("pnpm build 2>&1", { encoding: "utf-8" })

      expect(output.toLowerCase()).not.toContain("error ts")
      expect(output.toLowerCase()).not.toContain("implicit any")
    })
  })
})
