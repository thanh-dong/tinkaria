import { type PresetDefinition, getPreset } from "./preset-types"

export type MergePresetDefinition = PresetDefinition

export const MERGE_PRESETS: readonly MergePresetDefinition[] = [
  {
    id: "synthesis",
    label: "Synthesis",
    description: "Combine findings and decisions into a unified understanding.",
    defaultIntent: "Synthesize these sessions into a unified understanding. Extract the key findings, decisions, and constraints from each, resolve any contradictions, and frame the merged context as a single coherent brief for the next step.",
    generatorHint: "Bias toward a cohesive narrative that resolves contradictions and surfaces the strongest decisions from each source session.",
  },
  {
    id: "compare_decide",
    label: "Compare & decide",
    description: "Compare approaches explored in different sessions and surface trade-offs.",
    defaultIntent: "Compare the approaches explored across these sessions. Surface the trade-offs, identify which constraints each approach satisfies or violates, and frame the merged context to support a clear decision.",
    generatorHint: "Emphasize trade-offs, differences in assumptions, and decision criteria. Present approaches side-by-side.",
  },
  {
    id: "consolidate_progress",
    label: "Consolidate progress",
    description: "Merge partial work from several sessions into a single next-step brief.",
    defaultIntent: "Consolidate the progress from these sessions into a single next-step brief. Identify what was completed, what remains, and any blockers or dependencies across the sessions.",
    generatorHint: "Prioritize what was accomplished, what's left to do, and any cross-session dependencies or blockers.",
  },
  {
    id: "knowledge_base",
    label: "Knowledge base",
    description: "Extract and unify learned patterns, constraints, and decisions.",
    defaultIntent: "Extract and unify the learned patterns, constraints, and key decisions from these sessions. Organize them as a reference brief that can guide future work without re-reading the originals.",
    generatorHint: "Bias toward structured reference content: patterns, constraints, conventions, and decisions. Avoid execution steps.",
  },
] as const

export const MAX_MERGE_SESSIONS = 5
export const DEFAULT_MERGE_PRESET_ID = MERGE_PRESETS[0]!.id

export function getMergePreset(id?: string | null): MergePresetDefinition | null {
  return getPreset(MERGE_PRESETS, id)
}
