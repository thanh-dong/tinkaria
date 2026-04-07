import { type PresetDefinition, getPreset } from "./preset-types"

export type ForkPresetDefinition = PresetDefinition

export const FORK_PRESETS: readonly ForkPresetDefinition[] = [
  {
    id: "implementation_branch",
    label: "Implementation branch",
    description: "Continue toward a concrete feature or code change.",
    defaultIntent: "Continue this work as an implementation branch. Carry forward the essential technical context, note the main constraints, and focus the new session on the next concrete coding steps.",
    generatorHint: "Bias toward an execution-ready brief with concrete next implementation steps.",
  },
  {
    id: "alternative_approach",
    label: "Alternative approach",
    description: "Explore a different design or implementation path.",
    defaultIntent: "Fork this into an alternative approach. Preserve only the key constraints and decisions from the current chat, then frame the new session around a distinctly different implementation strategy.",
    generatorHint: "Emphasize the constraints and assumptions that still apply, but optimize for exploring a different solution path.",
  },
  {
    id: "bug_investigation",
    label: "Bug investigation",
    description: "Turn the current state into a focused debugging branch.",
    defaultIntent: "Fork this into a bug investigation. Extract the symptoms, likely causes, relevant files, and the strongest reproduction or verification steps so the new session can debug efficiently.",
    generatorHint: "Prioritize symptoms, repro steps, affected surfaces, and likely fault boundaries.",
  },
  {
    id: "cleanup_refactor",
    label: "Cleanup / refactor",
    description: "Narrow the work to code quality and simplification.",
    defaultIntent: "Fork this into a cleanup and refactor pass. Keep the important behavioral constraints, identify the code areas most worth simplifying, and focus the new session on safer structural improvement.",
    generatorHint: "Prioritize invariants, areas of complexity, and low-risk refactor opportunities.",
  },
  {
    id: "tests",
    label: "Write tests",
    description: "Build a testing-focused branch from the current work.",
    defaultIntent: "Fork this into a test-writing pass. Capture the intended behavior, risky edges, missing verification, and the best targets for regression or integration tests.",
    generatorHint: "Emphasize expected behavior, regressions to guard against, and concrete verification targets.",
  },
  {
    id: "docs_spec",
    label: "Docs / spec",
    description: "Extract the current work into a clearer brief or spec.",
    defaultIntent: "Fork this into a docs or spec-writing session. Distill the relevant decisions, architecture, constraints, and open questions into a cleaner written brief for follow-up work.",
    generatorHint: "Bias toward structured explanation, decisions, constraints, and unresolved questions.",
  },
] as const

export const DEFAULT_FORK_PRESET_ID = FORK_PRESETS[0]!.id

export function getForkPreset(id?: string | null): ForkPresetDefinition | null {
  return getPreset(FORK_PRESETS, id)
}
