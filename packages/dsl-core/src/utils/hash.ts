// @signalforge/dsl-core -- Browser-compatible SHA-256
// AGPL-3.0-only -- must NEVER import from closed packages.

export async function sha256Truncated(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = new Uint8Array(hashBuffer);
  const hashHex = Array.from(hashArray)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hashHex.slice(0, 32);
}
