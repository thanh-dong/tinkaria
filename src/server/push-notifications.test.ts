import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import {
  PushSubscriptionStore,
  createPushRouter,
  initVapid,
  getVapidPublicKey,
  type StoredPushSubscription,
} from "./push-notifications"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

describe("PushSubscriptionStore", () => {
  let dir: string
  let store: PushSubscriptionStore

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "push-test-"))
    store = new PushSubscriptionStore(path.join(dir, "push-subscriptions.json"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("add and list subscriptions", () => {
    const sub: StoredPushSubscription = {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "key1", auth: "auth1" },
    }
    store.add(sub)
    expect(store.getAll()).toHaveLength(1)
    expect(store.getAll()[0].endpoint).toBe("https://push.example.com/abc")
  })

  test("deduplicates by endpoint", () => {
    const sub: StoredPushSubscription = {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "key1", auth: "auth1" },
    }
    store.add(sub)
    store.add(sub)
    expect(store.getAll()).toHaveLength(1)
  })

  test("remove by endpoint", () => {
    const sub: StoredPushSubscription = {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "key1", auth: "auth1" },
    }
    store.add(sub)
    store.remove("https://push.example.com/abc")
    expect(store.getAll()).toHaveLength(0)
  })

  test("persists to disk and loads back", async () => {
    const sub: StoredPushSubscription = {
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "key1", auth: "auth1" },
    }
    store.add(sub)
    await store.save()

    const store2 = new PushSubscriptionStore(path.join(dir, "push-subscriptions.json"))
    await store2.load()
    expect(store2.getAll()).toHaveLength(1)
    expect(store2.getAll()[0].endpoint).toBe("https://push.example.com/abc")
  })

  test("load handles missing file gracefully", async () => {
    const store2 = new PushSubscriptionStore(path.join(dir, "nonexistent.json"))
    await store2.load()
    expect(store2.getAll()).toHaveLength(0)
  })
})

describe("createPushRouter", () => {
  let dir: string
  let store: PushSubscriptionStore

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "push-test-"))
    store = new PushSubscriptionStore(path.join(dir, "push-subscriptions.json"))
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  test("GET /api/push/vapid-key returns public key", async () => {
    const savedPublic = process.env.VAPID_PUBLIC_KEY
    const savedPrivate = process.env.VAPID_PRIVATE_KEY
    // Use real VAPID keys (web-push validates key length)
    const keys = (await import("web-push")).generateVAPIDKeys()
    process.env.VAPID_PUBLIC_KEY = keys.publicKey
    process.env.VAPID_PRIVATE_KEY = keys.privateKey

    try {
      initVapid()
      const router = createPushRouter(store)
      const req = new Request("http://localhost/api/push/vapid-key")
      const res = await router(req)
      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.publicKey).toBe(keys.publicKey)
    } finally {
      if (savedPublic) process.env.VAPID_PUBLIC_KEY = savedPublic
      else delete process.env.VAPID_PUBLIC_KEY
      if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
      else delete process.env.VAPID_PRIVATE_KEY
    }
  })

  test("POST /api/push/subscribe adds subscription", async () => {
    const router = createPushRouter(store)
    const sub = {
      endpoint: "https://push.example.com/xyz",
      keys: { p256dh: "k", auth: "a" },
    }
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(sub),
    })
    const res = await router(req)
    expect(res.status).toBe(201)
    expect(store.getAll()).toHaveLength(1)
  })

  test("DELETE /api/push/subscribe removes subscription", async () => {
    store.add({
      endpoint: "https://push.example.com/xyz",
      keys: { p256dh: "k", auth: "a" },
    })
    const router = createPushRouter(store)
    const req = new Request("http://localhost/api/push/subscribe", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/xyz" }),
    })
    const res = await router(req)
    expect(res.status).toBe(200)
    expect(store.getAll()).toHaveLength(0)
  })

  test("GET /api/push/vapid-key returns 503 when not configured", async () => {
    const savedPublic = process.env.VAPID_PUBLIC_KEY
    const savedPrivate = process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY

    try {
      initVapid()
      const router = createPushRouter(store)
      const req = new Request("http://localhost/api/push/vapid-key")
      const res = await router(req)
      expect(res.status).toBe(503)
      const body = await res.json()
      expect(body.error).toBe("Push notifications not configured")
    } finally {
      if (savedPublic) process.env.VAPID_PUBLIC_KEY = savedPublic
      if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
    }
  })

  test("POST /api/push/subscribe validates body - missing fields returns 400", async () => {
    const router = createPushRouter(store)

    // Missing endpoint entirely
    const res1 = await router(new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keys: { p256dh: "k", auth: "a" } }),
    }))
    expect(res1.status).toBe(400)

    // Missing keys
    const res2 = await router(new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/abc" }),
    }))
    expect(res2.status).toBe(400)

    // Invalid JSON
    const res3 = await router(new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json",
    }))
    expect(res3.status).toBe(400)

    // Invalid endpoint URL
    const res4 = await router(new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "not-a-url", keys: { p256dh: "k", auth: "a" } }),
    }))
    expect(res4.status).toBe(400)

    // Missing key fields (p256dh/auth)
    const res5 = await router(new Request("http://localhost/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: "https://push.example.com/abc", keys: { p256dh: 123, auth: "a" } }),
    }))
    expect(res5.status).toBe(400)
  })

  test("unknown route returns 404", async () => {
    const router = createPushRouter(store)
    const req = new Request("http://localhost/api/push/unknown")
    const res = await router(req)
    expect(res.status).toBe(404)
  })
})

describe("initVapid", () => {
  test("returns false when env vars not set", () => {
    const savedPublic = process.env.VAPID_PUBLIC_KEY
    const savedPrivate = process.env.VAPID_PRIVATE_KEY
    delete process.env.VAPID_PUBLIC_KEY
    delete process.env.VAPID_PRIVATE_KEY

    try {
      const result = initVapid()
      expect(result).toBe(false)
      expect(getVapidPublicKey()).toBeNull()
    } finally {
      if (savedPublic) process.env.VAPID_PUBLIC_KEY = savedPublic
      if (savedPrivate) process.env.VAPID_PRIVATE_KEY = savedPrivate
    }
  })
})
