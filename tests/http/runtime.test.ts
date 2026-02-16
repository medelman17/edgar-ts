import { describe, expect, it } from "vitest"
import { getRuntime } from "@/http/runtime"

describe("getRuntime", () => {
  it("returns 'bun' when process.versions.bun is defined", () => {
    const originalBun = process.versions.bun
    // @ts-expect-error - testing runtime detection
    process.versions.bun = "1.0.0"

    expect(getRuntime()).toBe("bun")

    // Restore
    if (originalBun) {
      // @ts-expect-error - restore
      process.versions.bun = originalBun
    } else {
      // @ts-expect-error - cleanup
      delete process.versions.bun
    }
  })

  it("returns 'node' when process.versions.bun is undefined", () => {
    const originalBun = process.versions.bun
    // @ts-expect-error - testing runtime detection
    delete process.versions.bun

    expect(getRuntime()).toBe("node")

    // Restore
    if (originalBun) {
      // @ts-expect-error - restore
      process.versions.bun = originalBun
    }
  })
})
