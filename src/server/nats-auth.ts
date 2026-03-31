import { randomBytes } from "node:crypto"

/** Generates a URL-safe base64 auth token for NATS server + client connections. */
export function generateAuthToken(): string {
  return randomBytes(32).toString("base64url")
}
