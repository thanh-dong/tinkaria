import { useState } from "react"
import { Box } from "lucide-react"
import type { AgentProvider, ProviderCatalogEntry } from "../../../shared/types"
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
  onFork: (context: string, provider: AgentProvider, model: string) => Promise<void>
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
      <DialogContent size="sm">
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
  onFork: (context: string, provider: AgentProvider, model: string) => Promise<void>
  onClose: () => void
}) {
  const [context, setContext] = useState("")
  const [provider, setProvider] = useState<AgentProvider>(defaultProvider)
  const [model, setModel] = useState(defaultModel)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const providerConfig = availableProviders.find((p) => p.id === provider) ?? availableProviders[0]
  const ProviderIcon = PROVIDER_ICONS[provider]

  function handleProviderChange(nextProvider: AgentProvider) {
    setProvider(nextProvider)
    const nextConfig = availableProviders.find((p) => p.id === nextProvider)
    if (nextConfig) {
      setModel(nextConfig.models[0]?.id ?? defaultModel)
    }
  }

  async function handleConfirm() {
    if (!context.trim() || pending) return
    setPending(true)
    setError(null)
    try {
      await onFork(context.trim(), provider, model)
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
      <div className="px-4 pb-4 pt-3.5 space-y-3">
        <Textarea
          placeholder="Start the new session with..."
          value={context}
          onChange={(e) => setContext(e.target.value)}
          autoFocus
          rows={4}
          className="resize-none text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && context.trim() && !pending) {
              e.preventDefault()
              void handleConfirm()
            }
          }}
        />
        <div className="flex items-center gap-1">
          <InputPopover
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
      <DialogFooter>
        <DialogGhostButton onClick={onClose} disabled={pending}>
          Cancel
        </DialogGhostButton>
        <DialogPrimaryButton
          onClick={() => void handleConfirm()}
          disabled={!context.trim() || pending}
        >
          {pending ? "Creating..." : "Create Session"}
        </DialogPrimaryButton>
      </DialogFooter>
    </>
  )
}
