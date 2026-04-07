export interface PresetDefinition {
  id: string
  label: string
  description: string
  defaultIntent: string
  generatorHint: string
}

export function getPreset<T extends PresetDefinition>(
  presets: readonly T[],
  id?: string | null,
): T | null {
  if (!id) return null
  return presets.find((preset) => preset.id === id) ?? null
}
