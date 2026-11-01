// Use configured deployment identity, never an untrusted request Host header.
export function publicOrigin(): string {
  const value = process.env.APP_ORIGIN || "http://localhost:3000";
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.origin !== value) {
    throw new Error("APP_ORIGIN must be an exact HTTP(S) origin.");
  }
  return url.origin;
}
