import { memo, useCallback, useMemo, useState } from "react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { Check, Copy } from "lucide-react"
import { createUiIdentityDescriptor, getUiIdentityAttributeProps } from "../../lib/uiIdentityOverlay"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { createMarkdownComponents } from "./shared"
import { parseSkillsFromContent } from "../../stores/skillCompositionStore"
import { SkillBadgesReadonly } from "../chat-ui/SkillBadges"

interface Props {
  content: string
}

type ClipboardWriter = Pick<Clipboard, "writeText">

export function copyUserPromptToClipboard(content: string, clipboard?: ClipboardWriter | null): Promise<boolean> {
  const target = clipboard ?? (typeof navigator === "undefined" ? null : navigator.clipboard)
  if (!target) {
    return Promise.resolve(false)
  }
  return target.writeText(content).then(
    () => true,
    () => false,
  )
}

export const UserMessage = memo(function UserMessage({ content }: Props) {
  const userPromptDescriptor = createUiIdentityDescriptor({
    id: "message.user.prompt",
    c3ComponentId: "c3-111",
    c3ComponentLabel: "transcript-surfaces",
  })
  const parsed = useMemo(() => parseSkillsFromContent(content), [content])
  const [copied, setCopied] = useState(false)
  const handleCopy = useCallback(async () => {
    const didCopy = await copyUserPromptToClipboard(parsed.content)
    if (!didCopy) {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [parsed.content])

  return (
    <div
      className="flex flex-col items-end gap-1.5"
      {...getUiIdentityAttributeProps(userPromptDescriptor)}
    >
      {parsed.skills ? (
        <SkillBadgesReadonly skills={parsed.skills} />
      ) : null}
      <div className="flex gap-2 justify-end pt-2">
        <div className="group/user-message relative max-w-[85%] sm:max-w-[80%]">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={cn(
              "absolute top-2 right-2 z-10 h-7 w-7 rounded-full border border-border/50 bg-background/80 p-0 text-muted-foreground backdrop-blur-sm",
              "opacity-0 transition-opacity duration-150",
              "group-hover/user-message:opacity-100",
              "group-active/user-message:opacity-100",
              !copied && "hover:border-foreground/20 hover:bg-background hover:text-foreground",
              copied && "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 !opacity-100"
            )}
            aria-label={copied ? "Copied prompt" : "Copy prompt"}
            onClick={handleCopy}
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
          </Button>
          <div className="rounded-[20px] py-1.5 px-3.5 bg-muted text-primary border border-border prose prose-sm prose-invert break-normal [overflow-wrap:break-word] [&_p]:whitespace-pre-line [&_p]:break-normal [&_p]:[overflow-wrap:break-word]">
            <Markdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents()}>{parsed.content}</Markdown>
          </div>
        </div>
      </div>
    </div>
  )
})
