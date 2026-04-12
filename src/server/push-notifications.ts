import webpush from "web-push"
import { LOG_PREFIX } from "../shared/branding"

// ── Types ──────────────────────────────────────────────────────────

export interface StoredPushSubscription {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface PushPayload {
  title: string
  body: string
  url?: string
  tag?: string
}

// ── VAPID ──────────────────────────────────────────────────────────

let vapidConfigured = false
let vapidPublicKey: string | null = null

export function initVapid(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  const subject = process.env.VAPID_SUBJECT ?? "mailto:tinkaria@localhost"

  if (!publicKey || !privateKey) {
    console.warn(LOG_PREFIX, "VAPID keys not configured — push notifications disabled")
    vapidConfigured = false
    vapidPublicKey = null
    return false
  }

  webpush.setVapidDetails(subject, publicKey, privateKey)
  vapidConfigured = true
  vapidPublicKey = publicKey
  console.warn(LOG_PREFIX, "Push notifications enabled (VAPID configured)")
  return true
}

export function getVapidPublicKey(): string | null {
  return vapidPublicKey
}

// ── Subscription Store ─────────────────────────────────────────────

export class PushSubscriptionStore {
  private subscriptions = new Map<string, StoredPushSubscription>()
  private readonly filePath: string

  constructor(filePath: string) {
    this.filePath = filePath
  }

  add(sub: StoredPushSubscription): void {
    this.subscriptions.set(sub.endpoint, sub)
  }

  remove(endpoint: string): void {
    this.subscriptions.delete(endpoint)
  }

  getAll(): StoredPushSubscription[] {
    return [...this.subscriptions.values()]
  }

  async save(): Promise<void> {
    const data = JSON.stringify(this.getAll(), null, 2)
    await Bun.write(this.filePath, data)
  }

  async load(): Promise<void> {
    try {
      const file = Bun.file(this.filePath)
      if (!(await file.exists())) return
      const data = await file.json()
      if (!Array.isArray(data)) return
      for (const sub of data) {
        if (sub.endpoint && sub.keys?.p256dh && sub.keys?.auth) {
          this.subscriptions.set(sub.endpoint, sub)
        }
      }
    } catch (err: unknown) {
      console.warn(LOG_PREFIX, "Failed to load push subscriptions:", err instanceof Error ? err.message : String(err))
    }
  }
}

// ── Push Sender ────────────────────────────────────────────────────

export async function sendPushToAll(
  store: PushSubscriptionStore,
  payload: PushPayload,
): Promise<void> {
  if (!vapidConfigured) return

  const subscriptions = store.getAll()
  if (subscriptions.length === 0) return

  const body = JSON.stringify(payload)
  const expiredEndpoints: string[] = []

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          body,
        )
      } catch (err: unknown) {
        const statusCode = err instanceof Error && "statusCode" in err
          ? (err as { statusCode: number }).statusCode
          : 0
        if (statusCode === 404 || statusCode === 410) {
          expiredEndpoints.push(sub.endpoint)
        } else {
          console.warn(
            LOG_PREFIX,
            `Push failed for ${sub.endpoint}:`,
            err instanceof Error ? err.message : String(err),
          )
        }
      }
    }),
  )

  // Clean up expired subscriptions
  for (const endpoint of expiredEndpoints) {
    store.remove(endpoint)
  }
  if (expiredEndpoints.length > 0) {
    await store.save()
  }
}

// ── HTTP Router ────────────────────────────────────────────────────

export function createPushRouter(
  store: PushSubscriptionStore,
): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)

    if (url.pathname === "/api/push/vapid-key" && req.method === "GET") {
      const key = getVapidPublicKey()
      if (!key) {
        return Response.json({ error: "Push notifications not configured" }, { status: 503 })
      }
      return Response.json({ publicKey: key })
    }

    if (url.pathname === "/api/push/subscribe" && req.method === "POST") {
      let body: Record<string, unknown>
      try { body = await req.json() } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 })
      }
      if (!body.endpoint || typeof body.endpoint !== "string" || !body.keys) {
        return Response.json({ error: "Invalid subscription" }, { status: 400 })
      }
      try { new URL(body.endpoint) } catch {
        return Response.json({ error: "Invalid endpoint URL" }, { status: 400 })
      }
      const keys = body.keys as Record<string, unknown>
      if (typeof keys.p256dh !== "string" || typeof keys.auth !== "string") {
        return Response.json({ error: "Invalid subscription keys" }, { status: 400 })
      }
      store.add({ endpoint: body.endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } })
      await store.save()
      return Response.json({ ok: true }, { status: 201 })
    }

    if (url.pathname === "/api/push/subscribe" && req.method === "DELETE") {
      let body: Record<string, unknown>
      try { body = await req.json() } catch {
        return Response.json({ error: "Invalid JSON" }, { status: 400 })
      }
      if (!body.endpoint || typeof body.endpoint !== "string") {
        return Response.json({ error: "Missing endpoint" }, { status: 400 })
      }
      store.remove(body.endpoint)
      await store.save()
      return Response.json({ ok: true })
    }

    return Response.json({ error: "Not found" }, { status: 404 })
  }
}
