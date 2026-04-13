import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  DEFAULT_VOICE_CONFIG,
  type VoiceInputProvider,
} from "../../shared/types"

interface VoiceInputState {
  /** STT provider to use */
  provider: VoiceInputProvider
  /** ISO 639-1 language code for the speaker's language, or "auto" */
  sourceLanguage: string
  /** ISO 639-1 language code for the output language */
  targetLanguage: string
  /** Whether to translate to target language automatically */
  autoTranslate: boolean
  /** Whether voice input is enabled (user has toggled it on) */
  enabled: boolean
  /** Whether the voice settings panel is expanded */
  settingsOpen: boolean

  setProvider: (provider: VoiceInputProvider) => void
  setSourceLanguage: (language: string) => void
  setTargetLanguage: (language: string) => void
  setAutoTranslate: (autoTranslate: boolean) => void
  setEnabled: (enabled: boolean) => void
  setSettingsOpen: (open: boolean) => void
  toggleSettingsOpen: () => void
}

export const useVoiceInputStore = create<VoiceInputState>()(
  persist(
    (set) => ({
      provider: DEFAULT_VOICE_CONFIG.provider,
      sourceLanguage: DEFAULT_VOICE_CONFIG.sourceLanguage,
      targetLanguage: DEFAULT_VOICE_CONFIG.targetLanguage,
      autoTranslate: DEFAULT_VOICE_CONFIG.autoTranslate,
      enabled: false,
      settingsOpen: false,

      setProvider: (provider) => set({ provider }),
      setSourceLanguage: (sourceLanguage) => set({ sourceLanguage }),
      setTargetLanguage: (targetLanguage) => set({ targetLanguage }),
      setAutoTranslate: (autoTranslate) => set({ autoTranslate }),
      setEnabled: (enabled) => set({ enabled }),
      setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
      toggleSettingsOpen: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
    }),
    {
      name: "voice-input-preferences",
      version: 1,
      partialize: (state) => ({
        provider: state.provider,
        sourceLanguage: state.sourceLanguage,
        targetLanguage: state.targetLanguage,
        autoTranslate: state.autoTranslate,
        enabled: state.enabled,
      }),
    }
  )
)
