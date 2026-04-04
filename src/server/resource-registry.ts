// src/server/resource-registry.ts
import type { ResourceLease, ResourceState, ResourceKind, ResourceManager, LeaseType } from "../shared/project-agent-types"

interface RegisterResourceArgs {
  name: string
  kind: ResourceKind
  managedBy: ResourceManager
  connectionString: string | null
}

interface InternalResource {
  name: string
  kind: ResourceKind
  status: "running" | "stopped" | "starting"
  managedBy: ResourceManager
  connectionString: string | null
  leases: Map<string, ResourceLease>
}

export class ResourceRegistry {
  private readonly resources = new Map<string, InternalResource>()
  private nextFencingToken = new Map<string, number>()
  private nextLeaseId = 1

  registerResource(args: RegisterResourceArgs): ResourceState {
    const resource: InternalResource = {
      name: args.name,
      kind: args.kind,
      status: "running",
      managedBy: args.managedBy,
      connectionString: args.connectionString,
      leases: new Map(),
    }
    this.resources.set(args.name, resource)
    if (!this.nextFencingToken.has(args.name)) {
      this.nextFencingToken.set(args.name, 1)
    }
    return this.toState(resource)
  }

  acquireLease(resourceName: string, heldBy: string, type: LeaseType, ttlMs: number): ResourceLease | null {
    const resource = this.resources.get(resourceName)
    if (!resource) return null

    for (const lease of resource.leases.values()) {
      if (lease.type === "exclusive") return null
      if (type === "exclusive") return null
    }

    const token = this.nextFencingToken.get(resourceName) ?? 1
    this.nextFencingToken.set(resourceName, token + 1)

    const lease: ResourceLease = {
      id: `lease-${this.nextLeaseId++}`,
      resource: resourceName,
      type,
      heldBy,
      fencingToken: token,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
      metadata: {},
    }
    resource.leases.set(lease.id, lease)
    return { ...lease, metadata: { ...lease.metadata } }
  }

  releaseLease(leaseId: string): boolean {
    for (const resource of this.resources.values()) {
      if (resource.leases.has(leaseId)) {
        resource.leases.delete(leaseId)
        return true
      }
    }
    return false
  }

  expireLeases(): ResourceLease[] {
    const now = Date.now()
    const expired: ResourceLease[] = []
    for (const resource of this.resources.values()) {
      for (const [id, lease] of resource.leases) {
        if (new Date(lease.expiresAt).getTime() <= now) {
          expired.push({ ...lease, metadata: { ...lease.metadata } })
          resource.leases.delete(id)
        }
      }
    }
    return expired
  }

  backdateLeaseForTest(leaseId: string, expiresAtMs: number): void {
    for (const resource of this.resources.values()) {
      const lease = resource.leases.get(leaseId)
      if (lease) {
        lease.expiresAt = new Date(expiresAtMs).toISOString()
        return
      }
    }
  }

  getResource(name: string): ResourceState | null {
    const resource = this.resources.get(name)
    return resource ? this.toState(resource) : null
  }

  listResources(): ResourceState[] {
    return [...this.resources.values()].map((r) => this.toState(r))
  }

  private toState(r: InternalResource): ResourceState {
    return {
      name: r.name,
      kind: r.kind,
      status: r.status,
      managedBy: r.managedBy,
      connectionString: r.connectionString,
      leases: [...r.leases.values()].map((l) => ({ ...l, metadata: { ...l.metadata } })),
    }
  }
}
