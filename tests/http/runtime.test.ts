import { describe, expect, it } from "vitest"
import { getRuntime } from "@/http/runtime"

describe("getRuntime", () => {
  it("returns consistent runtime value", () => {
    // Runtime is cached at module load time
    const runtime = getRuntime()
    expect(runtime).toMatch(/^(node|bun)$/)
  })

  it("returns same value on repeated calls (cached)", () => {
    // Verify caching behavior
    const first = getRuntime()
    const second = getRuntime()
    expect(first).toBe(second)
  })

  it("detects correct runtime for current environment", () => {
    // Verify actual runtime detection
    const runtime = getRuntime()
    const isBun = typeof process.versions.bun !== "undefined"

    if (isBun) {
      expect(runtime).toBe("bun")
    } else {
      expect(runtime).toBe("node")
    }
  })
})
