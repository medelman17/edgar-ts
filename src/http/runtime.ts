/**
 * Detect runtime environment (Node.js or Bun).
 * Cached at module load time for performance.
 */
export function getRuntime(): "node" | "bun" {
  return process.versions.bun ? "bun" : "node"
}
