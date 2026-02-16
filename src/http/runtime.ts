declare const process: { versions: { bun?: string; node: string } }

/**
 * Detect runtime environment (Node.js or Bun).
 * Cached at module load time for performance.
 */
const cachedRuntime: "node" | "bun" = process.versions.bun ? "bun" : "node"

export function getRuntime(): "node" | "bun" {
  return cachedRuntime
}
