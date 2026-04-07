import { useState } from "react"
import { Box, Search, Sparkles } from "lucide-react"
import { DEFAULT_MERGE_PRESET_ID, MAX_MERGE_SESSIONS, MERGE_PRESETS, getMergePreset } from "../../../shared/merge-presets"
import { formatRelativeTime } from "../../lib/formatters"
import type { AgentProvider, ProviderCatalogEntry, SidebarChatRow } from "../../../shared/types"
import {
  createC3UiIdentityDescriptor,
  createUiIdentity,
  getUiIdentityAttributeProps,
  getUiIdentityIdMap,
} from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
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
  /** Sidebar chats for the current project (excluding active chat) */
  availableChats: SidebarChatRow[]
  onMerge: (chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
}

const MERGE_SESSION_UI_DESCRIPTORS = {
  dialog: createC3UiIdentityDescriptor({
    id: "chat.merge-session.dialog",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  sessionsList: createC3UiIdentityDescriptor({
    id: "chat.merge-session.sessions.list",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  sessionsSearchInput: createC3UiIdentityDescriptor({
    id: "chat.merge-session.sessions.search.input",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  contextInput: createC3UiIdentityDescriptor({
    id: "chat.merge-session.context.input",
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  submitAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.submit", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  cancelAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.cancel", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  providerAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.provider", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  providerPopover: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.provider", "popover"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  modelAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.model", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  modelPopover: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.model", "popover"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  presetAction: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.preset", "action"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
  presetPopover: createC3UiIdentityDescriptor({
    id: createUiIdentity("chat.merge-session.preset", "popover"),
    c3ComponentId: "c3-110",
    c3ComponentLabel: "chat",
  }),
} as const
const MERGE_SESSION_UI_IDENTITIES = getUiIdentityIdMap(MERGE_SESSION_UI_DESCRIPTORS)

export function getMergeSessionUiIdentities() {
  return MERGE_SESSION_UI_IDENTITIES
}

export function getMergeSessionUiIdentityDescriptors() {
  return MERGE_SESSION_UI_DESCRIPTORS
}

// --- Helpers ---

const STATUS_COLORS: Record<string, string> = {
  running: "bg-emerald-500",
  starting: "bg-yellow-500",
  waiting_for_user: "bg-amber-500",
  idle: "bg-muted-foreground/40",
  failed: "bg-destructive",
}

// --- Component ---

export function MergeSessionDialog({
  open,
  onOpenChange,
  defaultProvider,
  defaultModel,
  availableProviders,
  availableChats,
  onMerge,
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
        size="md"
        className="max-md:inset-0 max-md:left-0 max-md:top-0 max-md:max-w-none max-md:max-h-none max-md:h-[100dvh] max-md:rounded-none max-md:border-0 max-md:translate-x-0 max-md:translate-y-0 max-md:shadow-none"
        {...getUiIdentityAttributeProps(MERGE_SESSION_UI_DESCRIPTORS.dialog)}
      >
        {open ? (
          <MergeSessionDialogBody
            key={openVersion}
            defaultProvider={defaultProvider}
            defaultModel={defaultModel}
            availableProviders={availableProviders}
            availableChats={availableChats}
            onMerge={onMerge}
            onClose={() => handleOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function MergeSessionDialogBody({
  defaultProvider,
  defaultModel,
  availableProviders,
  availableChats,
  onMerge,
  onClose,
}: {
  defaultProvider: AgentProvider
  defaultModel: string
  availableProviders: ProviderCatalogEntry[]
  availableChats: SidebarChatRow[]
  onMerge: (chatIds: string[], intent: string, provider: AgentProvider, model: string, preset?: string) => Promise<void>
  onClose: () => void
}) {
  const [selectedChatIds, setSelectedChatIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState("")
  const [presetId, setPresetId] = useState(DEFAULT_MERGE_PRESET_ID)
  const [intent, setIntent] = useState(() => getMergePreset(DEFAULT_MERGE_PRESET_ID)?.defaultIntent ?? "")
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider)
  const [model, setModel] = useState(defaultModel)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const providerConfig = availableProviders.find((p) => p.id === provider) ?? availableProviders[0]
  const preset = getMergePreset(presetId) ?? MERGE_PRESETS[0]
  const ProviderIcon = PROVIDER_ICONS[provider]

  const searchLower = searchQuery.toLowerCase()
  const filteredChats = searchQuery
    ? availableChats.filter((chat) => {
        const title = (chat.title || chat.chatId).toLowerCase()
        return title.includes(searchLower)
      })
    : availableChats

  function toggleChat(chatId: string) {
    setSelectedChatIds((prev) => {
      const next = new Set(prev)
      if (next.has(chatId)) {
        next.delete(chatId)
      } else if (next.size < MAX_MERGE_SESSIONS) {
        next.add(chatId)
      }
      return next
    })
  }

  function handleProviderChange(nextProvider: AgentProvider) {
    setProvider(nextProvider)
    const nextConfig = availableProviders.find((p) => p.id === nextProvider)
    if (nextConfig) {
      setModel(nextConfig.models[0]?.id ?? defaultModel)
    }
  }

  function handlePresetChange(nextPresetId: string) {
    setPresetId(nextPresetId)
    setIntent(getMergePreset(nextPresetId)?.defaultIntent ?? "")
  }

  async function handleConfirm() {
    if (selectedChatIds.size < 1 || !intent.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      await onMerge([...selectedChatIds], intent.trim(), provider, model, presetId)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setPending(false)
    }
  }

  const canSubmit = selectedChatIds.size >= 1 && intent.trim().length > 0 && !pending

  return (
    <>
      <DialogHeader>
        <DialogTitle>Merge sessions</DialogTitle>
      </DialogHeader>
      <div className="px-4 pb-4 pt-3.5 space-y-3 flex flex-col flex-1 min-h-0">
        <p className="text-sm text-muted-foreground">
          Select sessions to merge and describe how they should be combined.
        </p>

        {/* Session search + list */}
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            <input
              {...getUiIdentityAttributeProps(MERGE_SESSION_UI_DESCRIPTORS.sessionsSearchInput)}
              type="text"
              placeholder="Search sessions..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full text-xs pl-6 pr-2 py-1.5 bg-muted/50 border border-border rounded-lg outline-none placeholder:text-muted-foreground/50 focus:border-primary/40 transition-colors"
            />
          </div>
          <div className="flex items-center justify-between px-0.5">
            <span className="text-xs text-muted-foreground">
              {selectedChatIds.size} of {MAX_MERGE_SESSIONS} max selected
            </span>
          </div>
          <div
            {...getUiIdentityAttributeProps(MERGE_SESSION_UI_DESCRIPTORS.sessionsList)}
            className="max-h-[200px] overflow-y-auto [scrollbar-width:thin] border border-border rounded-lg"
          >
            {filteredChats.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-6">
                No sessions found
              </div>
            ) : (
              <div className="flex flex-col">
                {filteredChats.map((chat) => {
                  const selected = selectedChatIds.has(chat.chatId)
                  const atLimit = selectedChatIds.size >= MAX_MERGE_SESSIONS && !selected
                  return (
                    <button
                      key={chat.chatId}
                      onClick={() => toggleChat(chat.chatId)}
                      disabled={atLimit}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 text-left transition-colors border-b border-border last:border-b-0",
                        selected ? "bg-primary/10" : "hover:bg-muted/50",
                        atLimit && "opacity-40 cursor-not-allowed",
                      )}
                    >
                      {/* Checkbox */}
                      <div
                        className={cn(
                          "h-3.5 w-3.5 shrink-0 rounded border transition-colors flex items-center justify-center",
                          selected
                            ? "bg-primary border-primary text-primary-foreground"
                            : "border-muted-foreground/40",
                        )}
                      >
                        {selected ? (
                          <svg className="h-2.5 w-2.5" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 6l3 3 5-5" />
                          </svg>
                        ) : null}
                      </div>
                      {/* Chat info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium truncate">
                            {chat.title || chat.chatId}
                          </span>
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full shrink-0",
                              STATUS_COLORS[chat.status] ?? STATUS_COLORS.idle,
                            )}
                          />
                          {chat.provider ? (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0 leading-none">
                              {chat.provider}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {/* Relative time */}
                      <span className="text-[10px] text-muted-foreground shrink-0">
                        {formatRelativeTime(chat.lastMessageAt ?? chat._creationTime)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Preset picker */}
        <InputPopover
          triggerUiId={MERGE_SESSION_UI_DESCRIPTORS.presetAction}
          contentUiId={MERGE_SESSION_UI_DESCRIPTORS.presetPopover}
          trigger={
            <>
              <Sparkles className="h-3.5 w-3.5" />
              <span>{preset?.label ?? "Preset"}</span>
            </>
          }
        >
          {(close) =>
            MERGE_PRESETS.map((candidate) => (
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

        {/* Intent textarea */}
        <Textarea
          {...getUiIdentityAttributeProps(MERGE_SESSION_UI_DESCRIPTORS.contextInput)}
          placeholder="Describe how these sessions should be merged..."
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          autoFocus
          rows={4}
          className="resize-none text-sm flex-1 min-h-[4lh]"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && canSubmit) {
              e.preventDefault()
              void handleConfirm()
            }
          }}
        />

        {/* Provider / model selectors */}
        <div className="flex items-center gap-1">
          <InputPopover
            triggerUiId={MERGE_SESSION_UI_DESCRIPTORS.providerAction}
            contentUiId={MERGE_SESSION_UI_DESCRIPTORS.providerPopover}
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
            triggerUiId={MERGE_SESSION_UI_DESCRIPTORS.modelAction}
            contentUiId={MERGE_SESSION_UI_DESCRIPTORS.modelPopover}
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

        {/* Error display */}
        {error ? (
          <div className="text-sm text-destructive">{error}</div>
        ) : null}
      </div>
      <DialogFooter className="max-md:rounded-none max-md:pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <DialogGhostButton
          onClick={onClose}
          disabled={pending}
          {...getUiIdentityAttributeProps(MERGE_SESSION_UI_DESCRIPTORS.cancelAction)}
        >
          Cancel
        </DialogGhostButton>
        <DialogPrimaryButton
          onClick={() => void handleConfirm()}
          disabled={!canSubmit}
          {...getUiIdentityAttributeProps(MERGE_SESSION_UI_DESCRIPTORS.submitAction)}
        >
          {pending ? "Creating..." : "Create Session"}
        </DialogPrimaryButton>
      </DialogFooter>
    </>
  )
}
