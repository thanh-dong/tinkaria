import { create } from "zustand"
import { persist } from "zustand/middleware"

interface SkillCompositionState {
  selections: Record<string, string[]>
  usageCounts: Record<string, number>
  toggleSkill: (chatId: string, skill: string) => void
  clearSkills: (chatId: string) => void
  getSelectedSkills: (chatId: string) => string[]
  recordUsage: (skills: string[]) => void
}

export const useSkillCompositionStore = create<SkillCompositionState>()(
  persist(
    (set, get) => ({
      selections: {},
      usageCounts: {},

      toggleSkill: (chatId, skill) =>
        set((state) => {
          const current = state.selections[chatId] ?? []
          const next = current.includes(skill)
            ? current.filter((s) => s !== skill)
            : [...current, skill]

          if (next.length === 0) {
            const { [chatId]: _, ...rest } = state.selections
            return { selections: rest }
          }

          return { selections: { ...state.selections, [chatId]: next } }
        }),

      clearSkills: (chatId) =>
        set((state) => {
          const { [chatId]: _, ...rest } = state.selections
          return { selections: rest }
        }),

      getSelectedSkills: (chatId) => get().selections[chatId] ?? [],

      recordUsage: (skills) => {
        if (skills.length === 0) return
        set((state) => {
          const next = { ...state.usageCounts }
          for (const skill of skills) {
            next[skill] = (next[skill] ?? 0) + 1
          }
          return { usageCounts: next }
        })
      },
    }),
    { name: "skill-composition" }
  )
)

const SKILL_PREFIX_PATTERN = /^\[Skills: (\/[^\]]+)\](?:\n\n?)?/

export function parseSkillsFromContent(content: string): { skills: string[] | null; content: string } {
  const match = content.match(SKILL_PREFIX_PATTERN)
  if (!match) return { skills: null, content }

  const skillsRaw = match[1]
  const skills = skillsRaw.split(", ").map((s) => s.replace(/^\//, ""))
  const remaining = content.slice(match[0].length)
  return { skills, content: remaining }
}

export function formatContentWithSkills(content: string, skills: string[]): string {
  if (skills.length === 0) return content
  const prefix = `[Skills: ${skills.map((s) => `/${s}`).join(", ")}]`
  return `${prefix}\n\n${content}`
}

export function sortSkillsByFrequency(skills: string[], usageCounts: Record<string, number>): string[] {
  return [...skills].sort((a, b) => (usageCounts[b] ?? 0) - (usageCounts[a] ?? 0))
}
