import { useState } from "react"
import { Box, Sparkles } from "lucide-react"
import { DEFAULT_FORK_PRESET_ID, FORK_PRESETS, getForkPreset } from "../../../shared/fork-presets"
import type { AgentProvider, ProviderCatalogEntry } from "../../../shared/types"
import {
  createC3UiIdentityDescriptor,
  createUiIdentity,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../../lib/uiIdentityOverlay"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogGhostButton,
  DialogHeader,
  DialogPrimaryButton,
  DialogTitle,
} from "../ui/dialog"
import { Textarea } from "../ui/textarea"
import { InputPopover, PopoverMenuItem, PROVIDER_ICONS } from "./ChatPreferenceControls"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  defaultProvider: AgentProvider
  defaultModel: string
  availableProviders: ProviderCatalogEntry[]
  onFork: (intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
}

const FORK_SESSION_UI_DESCRIPTORS = {
  dialog: createC3UiIdentityDescriptor({
    id: "chat.fork-session.dialog",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  contextInput: createC3UiIdentityDescriptor({
    id: "chat.fork-session.context.input",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  submitAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.submit", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  cancelAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.cancel", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  providerAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.provider", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  providerPopover: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.provider", "popover"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  modelAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.model", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  modelPopover: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.model", "popover"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  presetAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.preset", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  presetPopover: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.fork-session.preset", "popover"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
} as const
const FORK_SESSION_UI_IDENTITIES = getUiIdentityIdMap(FORK_SESSION_UI_DESCRIPTORS)

export function getForkSessionUiIdentities() {
  return FORK_SESSION_UI_IDENTITIES
}

export function getForkSessionUiIdentityDescriptors() {
  return FORK_SESSION_UI_DESCRIPTORS
}

export function ForkSessionDialog({
  open,
  onOpenChange,
  defaultProvider,
  defaultModel,
  availableProviders,
  onFork,
}: Props) {
  const [openVersion, setOpenVersion] = useState(0)

  function handleOpenChange(nextOpen: boolean) {
    if (nextOpen && !open) {
      setOpenVersion((current) => current + 1)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        size="sm"
        className="max-md:inset-0 max-md:left-0 max-md:top-0 max-md:max-w-none max-md:max-h-none max-md:h-[100dvh] max-md:rounded-none max-md:border-0 max-md:translate-x-0 max-md:translate-y-0 max-md:shadow-none"
        {...getUiIdentityAttributeProps(FORK_SESSION_UI_DESCRIPTORS.dialog)}
      >
        {open ? (
          <ForkSessionDialogBody
            key={openVersion}
            defaultProvider={defaultProvider}
            defaultModel={defaultModel}
            availableProviders={availableProviders}
            onFork={onFork}
            onClose={() => handleOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ForkSessionDialogBody({
  defaultProvider,
  defaultModel,
  availableProviders,
  onFork,
  onClose,
}: {
  defaultProvider: AgentProvider
  defaultModel: string
  availableProviders: ProviderCatalogEntry[]
  onFork: (intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
  onClose: () => void
}) {
  const [presetId, setPresetId] = useState(DEFAULT_FORK_PRESET_ID)
  const [intent, setIntent] = useState(() => getForkPreset(DEFAULT_FORK_PRESET_ID)?.defaultIntent ?? "")
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider)
  const [model, setModel] = useState(defaultModel)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const providerConfig = availableProviders.find((p) => p.id === provider) ?? availableProviders[0]
  const preset = getForkPreset(presetId) ?? FORK_PRESETS[0]
  const ProviderIcon = PROVIDER_ICONS[provider]

  function handleProviderChange(nextProvider: AgentProvider) {
    setProvider(nextProvider)
    const nextConfig = availableProviders.find((p) => p.id === nextProvider)
    if (nextConfig) {
      setModel(nextConfig.models[0]?.id ?? defaultModel)
    }
  }

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId)
    setIntent(getForkPreset(nextPresetId)?.defaultIntent ?? "")
  }

  async function handleConfirm() {
    if (!intent.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      await onFork(intent.trim(), provider, model, presetId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Fork session</DialogTitle>
      </DialogHeader>
      <div className="px-4 pb-4 pt-3.5 space-y-3 flex flex-col flex-1 min-h-0">
        <p className="text-sm text-muted-foreground">
          Describe what this fork should focus on. Tinkaria will combine that with the current chat to seed the new session.
        </p>
        <InputPopover
          triggerUiId={FORK_SESSION_UI_DESCRIPTORS.presetAction}
          contentUiId={FORK_SESSION_UI_DESCRIPTORS.presetPopover}
          trigger={
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>{preset?.label ?? "Preset"}</span>
            </>
          }
        >
          {(close) =>
            FORK_PRESETS.map((candidate) => (
              <PopoverMenuItem
                key={candidate.id}
                onClick={() => {
                  handlePresetChange(candidate.id)
                  close()
                }}
                selected={candidate.id === presetId}
                icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
                label={candidate.label}
                description={candidate.description}
              />
            ))
          }
        </InputPopover>
        <Textarea
          {...getUiIdentityAttributeProps(FORK_SESSION_UI_DESCRIPTORS.contextInput)}
          placeholder="What should this fork focus on?"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          autoFocus
          rows={4}
          className="resize-none text-sm flex-1 min-h-[4lh]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && intent.trim() && !pending) {
              e.preventDefault()
              void handleConfirm()
            }
          }}
        />
        <div className="flex items-center gap-1">
          <InputPopover
            triggerUiId={FORK_SESSION_UI_DESCRIPTORS.providerAction}
            contentUiId={FORK_SESSION_UI_DESCRIPTORS.providerPopover}
            trigger={
              <>
                <ProviderIcon className="h-3.5 w-3.5" />
                <span>{providerConfig?.label ?? provider}</span>
              </>
            }
          >
            {(close) =>
              availableProviders.map((p) => {
                const Icon = PROVIDER_ICONS[p.id]
                return (
                  <PopoverMenuItem
                    key={p.id}
                    onClick={() => {
                      handleProviderChange(p.id)
                      close()
                    }}
                    selected={provider === p.id}
                    icon={<Icon className="h-4 w-4 text-muted-foreground" />}
                    label={p.label}
                  />
                )
              })
            }
          </InputPopover>
          <InputPopover
            triggerUiId={FORK_SESSION_UI_DESCRIPTORS.modelAction}
            contentUiId={FORK_SESSION_UI_DESCRIPTORS.modelPopover}
            trigger={
              <>
                <Box className="h-3.5 w-3.5" />
                <span>{providerConfig?.models.find((m) => m.id === model)?.label ?? model}</span>
              </>
            }
          >
            {(close) =>
              (providerConfig?.models ?? []).map((m) => (
                <PopoverMenuItem
                  key={m.id}
                  onClick={() => {
                    setModel(m.id)
                    close()
                  }}
                  selected={model === m.id}
                  icon={<Box className="h-4 w-4 text-muted-foreground" />}
                  label={m.label}
                />
              ))
            }
          </InputPopover>
        </div>
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : null}
      </div>
      <DialogFooter className="max-md:rounded-none max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <DialogGhostButton
          onClick={onClose}
          disabled={pending}
          {...getUiIdentityAttributeProps(FORK_SESSION_UI_DESCRIPTORS.cancelAction)}
        >
          Cancel
        </DialogGhostButton>
        <DialogPrimaryButton
          onClick={() => void handleConfirm()}
          disabled={!intent.trim() || pending}
          {...getUiIdentityAttributeProps(FORK_SESSION_UI_DESCRIPTORS.submitAction)}
        >
          {pending ? "Creating..." : "Create Session"}
        </DialogPrimaryButton>
      </DialogFooter>
    </>
  )
}
