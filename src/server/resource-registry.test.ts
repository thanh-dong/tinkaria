// src/server/resource-registry.test.ts
import { describe, expect, test } from "bun:test"
import { ResourceRegistry } from "./resource-registry"

describe("ResourceRegistry", () => {
  describe("registerResource", () => {
    test("registers a new resource", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "postgres://localhost:5432" })
      const resources = reg.listResources()
      expect(resources.length).toBe(1)
      expect(resources[0].name).toBe("postgres")
      expect(resources[0].status).toBe("running")
    })
  })

  describe("acquireLease", () => {
    test("acquires exclusive lease", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "migrations", kind: "process", managedBy: "manual", connectionString: null })
      const lease = reg.acquireLease("migrations", "chat-1", "exclusive", 60_000)
      expect(lease).not.toBeNull()
      expect(lease!.type).toBe("exclusive")
      expect(lease!.heldBy).toBe("chat-1")
      expect(lease!.fencingToken).toBe(1)
    })

    test("blocks second exclusive lease", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "migrations", kind: "process", managedBy: "manual", connectionString: null })
      reg.acquireLease("migrations", "chat-1", "exclusive", 60_000)
      const second = reg.acquireLease("migrations", "chat-2", "exclusive", 60_000)
      expect(second).toBeNull()
    })

    test("allows multiple shared leases", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "pg://..." })
      const l1 = reg.acquireLease("postgres", "chat-1", "shared", 60_000)
      const l2 = reg.acquireLease("postgres", "chat-2", "shared", 60_000)
      expect(l1).not.toBeNull()
      expect(l2).not.toBeNull()
    })

    test("blocks shared lease when exclusive is held", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "migrations", kind: "process", managedBy: "manual", connectionString: null })
      reg.acquireLease("migrations", "chat-1", "exclusive", 60_000)
      const shared = reg.acquireLease("migrations", "chat-2", "shared", 60_000)
      expect(shared).toBeNull()
    })

    test("increments fencing token", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const l1 = reg.acquireLease("res", "chat-1", "exclusive", 60_000)
      reg.releaseLease(l1!.id)
      const l2 = reg.acquireLease("res", "chat-2", "exclusive", 60_000)
      expect(l2!.fencingToken).toBe(2)
    })

    test("returns null for unregistered resource", () => {
      const reg = new ResourceRegistry()
      const lease = reg.acquireLease("nonexistent", "chat-1", "exclusive", 60_000)
      expect(lease).toBeNull()
    })
  })

  describe("releaseLease", () => {
    test("releases held lease", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const lease = reg.acquireLease("res", "chat-1", "exclusive", 60_000)
      const released = reg.releaseLease(lease!.id)
      expect(released).toBe(true)
    })

    test("returns false for unknown lease", () => {
      const reg = new ResourceRegistry()
      expect(reg.releaseLease("nope")).toBe(false)
    })

    test("allows new exclusive after release", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const l1 = reg.acquireLease("res", "chat-1", "exclusive", 60_000)
      reg.releaseLease(l1!.id)
      const l2 = reg.acquireLease("res", "chat-2", "exclusive", 60_000)
      expect(l2).not.toBeNull()
    })
  })

  describe("expireLease", () => {
    test("expires leases past TTL", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "res", kind: "process", managedBy: "manual", connectionString: null })
      const lease = reg.acquireLease("res", "chat-1", "exclusive", 100) // 100ms TTL

      // Manually backdate
      reg.backdateLeaseForTest(lease!.id, Date.now() - 200)

      const expired = reg.expireLeases()
      expect(expired.length).toBe(1)
      expect(expired[0].id).toBe(lease!.id)

      // Should now allow new lease
      const l2 = reg.acquireLease("res", "chat-2", "exclusive", 60_000)
      expect(l2).not.toBeNull()
    })
  })

  describe("getResource", () => {
    test("returns resource with its leases", () => {
      const reg = new ResourceRegistry()
      reg.registerResource({ name: "postgres", kind: "database", managedBy: "zerobased", connectionString: "pg://..." })
      reg.acquireLease("postgres", "chat-1", "shared", 60_000)
      reg.acquireLease("postgres", "chat-2", "shared", 60_000)

      const res = reg.getResource("postgres")
      expect(res).not.toBeNull()
      expect(res!.leases.length).toBe(2)
    })

    test("returns null for unknown resource", () => {
      const reg = new ResourceRegistry()
      expect(reg.getResource("nope")).toBeNull()
    })
  })
})
