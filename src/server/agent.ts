/**
 * Backward-compatible re-exports.
 *
 * AgentCoordinator was removed — all turn execution is delegated to the
 * runner process via RunnerProxy.  Only the shared transcript helpers
 * survive, now canonical in src/shared/transcript-entries.ts.
 */
export { timestamped, discardedToolResult } from "../shared/transcript-entries"
