import type { EventStore } from "./event-store"
import type { RepoManager } from "./repo-manager"

const LOG_PREFIX = "[GitClonePolicy]"

export class GitClonePolicy {
  constructor(
    private store: EventStore,
    private repoManager: RepoManager,
    private onStateChange?: () => void,
  ) {}

  /** Fire-and-forget: clones repo, then emits repo_cloned or repo_clone_failed */
  async onRepoCloneStarted(repoId: string, origin: string, targetPath: string): Promise<void> {
    try {
      await this.repoManager.clone(origin, targetPath)
      const info = await this.repoManager.addLocal(targetPath)
      await this.store.markRepoCloned(repoId, targetPath, info.branch)
      try { this.onStateChange?.() } catch { /* broadcast failure is non-fatal */ }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.warn(`${LOG_PREFIX} Clone failed for ${origin}:`, message)
      await this.store.markRepoCloneFailed(repoId, message)
      try { this.onStateChange?.() } catch { /* broadcast failure is non-fatal */ }
    }
  }
}
