import { memo } from "react"
import { Globe, Languages, Mic, MicOff, Settings2 } from "lucide-react"
import {
  VOICE_SOURCE_LANGUAGES,
  VOICE_TARGET_LANGUAGES,
} from "../../../shared/types"
import { cn } from "../../lib/utils"
import { useVoiceInputStore } from "../../stores/voiceInputStore"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Button } from "../ui/button"

function LanguageSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: { code: string; label: string }[]
  onChange: (code: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm",
          "focus:outline-none focus:ring-2 focus:ring-ring",
          "dark:bg-card/60"
        )}
      >
        {options.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function VoiceSettingsInner({ isAvailable }: { isAvailable: boolean | null }) {
  const sourceLanguage = useVoiceInputStore((s) => s.sourceLanguage)
  const targetLanguage = useVoiceInputStore((s) => s.targetLanguage)
  const autoTranslate = useVoiceInputStore((s) => s.autoTranslate)
  const enabled = useVoiceInputStore((s) => s.enabled)
  const setSourceLanguage = useVoiceInputStore((s) => s.setSourceLanguage)
  const setTargetLanguage = useVoiceInputStore((s) => s.setTargetLanguage)
  const setAutoTranslate = useVoiceInputStore((s) => s.setAutoTranslate)
  const setEnabled = useVoiceInputStore((s) => s.setEnabled)

  if (isAvailable === false) return null

  const sourceLabel = VOICE_SOURCE_LANGUAGES.find((l) => l.code === sourceLanguage)?.label ?? sourceLanguage
  const targetLabel = VOICE_TARGET_LANGUAGES.find((l) => l.code === targetLanguage)?.label ?? targetLanguage

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            "gap-1.5 text-xs h-8 px-2.5 rounded-full",
            enabled
              ? "text-foreground border border-border"
              : "text-muted-foreground"
          )}
        >
          {enabled ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">
            {enabled
              ? autoTranslate
                ? `${sourceLabel} \u2192 ${targetLabel}`
                : sourceLabel
              : "Voice"}
          </span>
          <Settings2 className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-72 p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Mic className="h-4 w-4" />
              <span className="text-sm font-medium">Voice Input</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled(!enabled)}
              className={cn(
                "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                enabled ? "bg-primary" : "bg-muted"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                  enabled ? "translate-x-4" : "translate-x-0"
                )}
              />
            </button>
          </div>

          {enabled ? (
            <>
              <div className="border-t border-border" />

              <LanguageSelect
                label="You speak"
                value={sourceLanguage}
                options={VOICE_SOURCE_LANGUAGES}
                onChange={setSourceLanguage}
              />

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Languages className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Auto-translate</span>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={autoTranslate}
                  onClick={() => setAutoTranslate(!autoTranslate)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    autoTranslate ? "bg-primary" : "bg-muted"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform",
                      autoTranslate ? "translate-x-4" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {autoTranslate ? (
                <LanguageSelect
                  label="Translate to"
                  value={targetLanguage}
                  options={VOICE_TARGET_LANGUAGES}
                  onChange={setTargetLanguage}
                />
              ) : null}

              <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground flex items-start gap-2">
                <Globe className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  {autoTranslate
                    ? `Speak in ${sourceLabel === "Auto-detect" ? "any language" : sourceLabel}, agent receives ${targetLabel}.`
                    : `Speak in ${sourceLabel === "Auto-detect" ? "any language" : sourceLabel}. No translation.`
                  }
                </span>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              Enable voice input to speak commands to the agent. Requires microphone access and an OpenAI API key on the server.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export const VoiceSettings = memo(VoiceSettingsInner)
